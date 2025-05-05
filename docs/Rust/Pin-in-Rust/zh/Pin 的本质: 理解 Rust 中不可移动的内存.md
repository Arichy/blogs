Pin 是 Rust 里一个初学者难以理解的概念, 因为其过于抽象, 但同时也是 async rust 的基石. 本文会按照

- 为什么需要 Pin
- 什么是 Pin
- Pin 的原理, 实现一个简单的 MyPin

的顺序来介绍, 帮助初学者理解.

# 为什么需要 Pin

## 危险的自引用结构

在 Rust 里, 有一种特别危险的数据结构, 叫自引用结构, 指的是一个结构体内部有一个引用/指针, 指向了自己的另一个字段. 因为 Rust 里一个结构体可以在内存里自由移动, 当移动后, 指针的值并不会自动更新, 所以依然指向原来的地址, 导致自引用结构被破坏, 造成 undefined behavior.

举个例子 (为了简单起见, 我们使用指针而不是引用, 来避开生命周期)

```rust
#[derive(Debug)]
struct SelfRef {
    v: String,
    ptr: *const String,
}


impl SelfRef {
    pub fn new(v: String) -> Self {
        Self {
            v,
            ptr: std::ptr::null(),
        }
    }

    pub fn correct_ptr(&mut self) {
        self.ptr = &self.v;
    }
}

fn create_self_ref(v: String) -> SelfRef {
    let mut res = SelfRef::new(v);
    res.correct_ptr();
    res
}

fn main() {
    let a = create_self_ref("hello".to_string());

    println!("{}", unsafe { &*a.ptr });
}
```

上面定义的 `SelfRef` 的 `ptr` 会指向自己的 `v`, 是一个典型的自引用结构. 但是上面的代码运行会 crash, 因为在调用 `create_self_ref` 时, 创建了一个结构体 `res`, 然后将 `res.ptr` 设置为了 `res.v` 的地址, 此时一切正常. 但是这个函数将 `res` 返回给了 `main`, 其中发生了移动, 导致结构体的内存地址发生了变化, 但是里面的 `ptr` 指针的值并没有更新, 在解引用时就会 UB.

自引用结构在我们日常写代码时可能用得不多, 但是在 async 里, 到处都是这种结构. 如果你对 async 不熟悉, 这里简单介绍一下.

## async/await 的本质

async/await 本质上是一个语法糖, Rust 编译器会将其编译为一个状态机.

```rust
async fn self_referential() -> i32 {
    let x = String::from("hello");
    let x_ref = &x; // 创建对 x 的引用

    // 这里插入一个等待点，让编译器生成状态机
    dummy_future().await;

    // 在等待后使用引用 - 这会导致自引用结构
    x_ref.len() as i32
}
```

会被编译成类似下面的代码:

```rust
enum SelfReferentialFuture {
    // 初始状态
    Start,
    // 等待 dummy_future 完成的状态
    WaitingOnDummy {
        x: String,
        x_ref: *const String,
        dummy: DummyFuture,
    },
    // 结束状态
    Done,
}
```

当一个引用被跨 await 访问时, 就会产生自引用结构, 因为这些变量必须被存到 Future 结构体内部. 如果这个 Future 在 poll 过程中发生了移动, 那么引用就会失效.

所以本质上是因为 async await 生成的 Future 结构体很容易出现自引用结构, 我们需要 Pin 住它. 这也是 Future::poll 函数签名的原因:

```rust
fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>
```

第一个参数是 `Pin<&mut self>` 而不是 `&mut self`, 就是希望在 `poll` 执行过程中这个 future 自己不发生移动.

# Pin 和 Unpin

首先需要明确一个点. **对于一个类型为 T 的值来说, 想要移动它, 前提是必须获得 `&mut T`**. 如果无法获得 `&mut T`, 那么也就无法移动它.

接下来我们看 `Pin` 和 `Unpin`

```rust
pub struct Pin<Ptr> {
   pub __pointer: Ptr,
}

pub auto trait Unpin {}
```

`Pin` 是一个 struct, 内部会存储一个**指针类型** `Ptr`. 这里的指针类型指的是实现了 `Deref` trait 的类型, 比如 `Box`, `Rc`, `Arc`, `&T`, `&mut T` 等. 之所以内部存的是指针而不是直接存结构体 `T`, 是因为如果将 `T` 直接存入 `Pin` 中, 那么 `T` 和 `Pin` 会一起存在一起. 当 `Pin` 移动时, `T` 也会被带着一起移动. 但是如果 `Pin` 存的只是一个指针, `Pin` 带着指针移动就没问题了, 指针指向的 `T` 本身并没有移动.

![Bad move](https://github.com/Arichy/blogs/blob/main/docs/Rust/Pin-in-Rust/imgs/bad.png?raw=true)

![Good move](https://github.com/Arichy/blogs/blob/main/docs/Rust/Pin-in-Rust/imgs/good.png?raw=true)

`Unpin` 是一个 auto trait, 也就是说如果一个结构体内部所有的字段都实现了 `Unpin`, 那么这个结构体会自动实现 `Unpin`. 默认情况下, 所有的值都是 `Unpin`. 比如我们上面写的 `SelfRef` 也是 `Unpin`. `Unpin` 的意思是, **这个结构体不关心自己是否被移动**, 并不是能移动/不能被移动. Rust 中所有类型在语义上都可以移动。`Unpin` 表示即使该类型被 `Pin` 包裹，依然可以通过 `Pin::get_mut()` 拿出其 `&mut T` 并进行移动。只有 `!Unpin` 类型才能从类型系统层面强制禁止移动。

但是显然, `SelfRef` 是需要关心自己是否被移动的, 所以我们需要手动让其不实现 `Unpin`.

在 nightly 版本中, 可以用以下方式:

```rust
impl !Unpin for SelfRef{}
```

但是实现 !Trait 目前还是 unstable feature, 所以需要用 marker field 的方式来实现

```rust
struct SelfRef {
    v: String,
    ptr: *const String,
    _pin: PhantomPinned, // marker
}
```

`PhantomPinned` 是一个 `std::marker` 提供的一个 struct, 它在内部实现了 `!Unpin`, 所以 `SelfRef` 就不会自动实现 `Unpin` 了.

`Pin<&mut T>` 或者 `Pin<Box<T>>` 的语意是, 要么保证 `T` 不会被移动, 要么 `T: Unpin`. 这一点很重要, 因为如果 `T: Unpin`, 说明 `T` 并不关心自己是否被移动了, 那么 `Pin<&mut T>` 就毫无意义, 失去了保护作用. 这一点在我们看 `Pin` 提供的方法时很有用.

# Pin 的原理

其实 `Pin` 的原理非常简单, 没有任何魔法. 想象一下, 假设现在完全不存在 `Pin`, 对于上面的 `SelfRef`, 我们希望让他不要被移动, 可以怎么做? 最简单的方法就是将其放到堆上, 然后将其包裹在另一个结构体例

```rust
// crate 1
pub struct MyPin<Ptr> {
    ptr: Ptr,
}

impl<Ptr: Deref> MyPin<Ptr> { // Ptr 需要是一个指针类型
    pub fn new(ptr: Ptr) -> Self {
        Self { ptr }
    }
}

// crate 2
let sr = SelfRef::new("hello".to_string());
let mut boxed = Box::new(sr);
boxed.correct_ptr();
let my_pinned_sr = MyPin::new(boxed);
```

好, 完成. 当在编辑器里输入 `my_pinned_sr.` 时, 不会有任何提示, 因为 `MyPin` 上没有任何方法, 也没有任何字段. `ptr` 是一个 private field, 在外部 crate 里也无法访问. `sr` 被严丝合缝地包裹在里面, 没有任何方法能访问到它, 自然就不会发生移动. 请注意上面调用了一次 `boxed.correct_ptr()`, 因为 `Box::new(sr)` 本身会把 `sr` 从栈移动到堆上, 所以在移动结束后需要修复一下指针.

上面版本确实做到了防止 `sr` 被移动, 因为根本就没有任何方法能访问到它. 但是显然这样毫无意义, 我们肯定是需要访问 `sr` 的. 还记得智能指针是怎么做到的吗? 没错, `Deref` 和 `DerefMut`.

```rust
impl<Ptr: Deref> Deref for MyPin<Ptr> {
    type Target = Ptr::Target;
    fn deref(&self) -> &Self::Target {
        self.ptr.deref()
    }
}

impl SelfRef {
    pub fn say_string(&self) {
        println!("My value is: {}", self.v);
    }

    pub fn correct_ptr(&mut self) {
        self.ptr = &self.v;
    }
}

// 省略重复代码
my_pinned_sr.say_string();
println!("{}", my_pinned_sr.v);
```

这样我们就可以访问 `my_pinned_sr` 里的字段, 以及需要不可变引用的方法了. 因为我们只实现了 `Deref`, 只能获取不可变引用, 不能获取可变引用. 所以也不用担心在堆上的 `sr` 被移动. 假如现在 `sr` 需要被传给其他地方使用, 我们只需要将 `my_pinned_sr` 传过去就行了: `handle(my_pinned_str)`, `handle` 没有任何办法可以移动 `sr`.

但是如果需要可变引用怎么办? 假如直接实现 `DerefMut` 来允许用户获取可变引用:

```rust
impl<Ptr: DerefMut> DerefMut for MyPin<Ptr> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ptr.deref_mut()
    }
}
```

这样用户就可以拿到 `&mut SelfRef`, 从而移动它了, `MyPinned` 的保护就失去了意义. 用户完全可以这样做:

```rust
fn print(name: &str, pinned: &MyPin<Box<SelfRef>>) {
    println!(
        "addr of {name}.v: {:?}, value of {name}.ptr {:?}, value of {name}.v: {} , deref value of {name}.ptr: {}",
        &pinned.ptr.v as *const String,
        pinned.ptr.ptr,
        pinned.v,
        unsafe { &*pinned.ptr.ptr }
    );
}


let mut a = Box::new(SelfRef::new("hello".to_string()));
a.correct_ptr();
let mut pinned_a = MyPin::new(a);

let mut b = Box::new(SelfRef::new("world".to_string()));
b.correct_ptr();
let mut pinned_b = MyPin::new(b);

print("a", &pinned_a);
print("b", &pinned_b);
std::mem::swap(&mut *pinned_a, &mut *pinned_b); // 危险! 通过 swap 移动这两个 pinned sr
print("a", &pinned_a);
print("b", &pinned_b);
```

打印如下:

```rust
addr of a.v: 0x60000165d1e0, value of a.ptr 0x60000165d1e0, value of a.v: hello , deref value of a.ptr: hello
addr of b.v: 0x60000165d200, value of b.ptr 0x60000165d200, value of b.v: world , deref value of b.ptr: world
addr of a.v: 0x60000165d1e0, value of a.ptr 0x60000165d200, value of a.v: world , deref value of a.ptr: hello
addr of b.v: 0x60000165d200, value of b.ptr 0x60000165d1e0, value of b.v: hello , deref value of b.ptr: world
```

可以看到在交换后, `a.ptr` 和 `b.ptr` 都指向了错误的地址. 预期是指向自己的 `v`, 但实际上指向了对方的 `v`.

这就陷入了一个两难. 我们既要一种能获得 `&mut SelfRef` 的方法, 又要让用户不通过这个方法去移动 `SelfRef`. 目前 Rust 编译器无法判断用户拿到 `&mut T` 之后进行的操作是否会移动 `T`. 所以官方的 `Pin` 用了一个比较极端的方式: `unsafe fn`.

- 对于 `T: Unpin`, 直接通过实现 `DerefMut` 的方式提供 `&mut T`
- 对于 `T: !Unpin`, 通过 `unsafe fn` 的方式提供 `&mut T`

```rust
// 只有对 Target, 也就是 T 实现了 Unpin 的 MyPin, 实现 DerefMut, 直接获得 &mut T
impl<Ptr: DerefMut<Target: Unpin>> DerefMut for MyPin<Ptr> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ptr.deref_mut()
    }
}

impl<Ptr: DerefMut> MyPin<Ptr> {
    // as_mut 的主要作用是解决生命周期的问题, 因为 Ptr 没有生命周期, 但是 &mut T 有
    // 建立起一个从 MyPin<Ptr> -> MyPin<&'a mut T> -> &'a mut T 的桥梁
    pub fn as_mut(&mut self) -> MyPin<&mut Ptr::Target> {
        MyPin {
            ptr: &mut *self.ptr,
        }
    }
}

impl<'a, T> MyPin<&'a mut T> {
    // 对于 T: Unpin, 直接获取 &mut T
    pub fn get_mut(self) -> &'a mut T
    where
        T: Unpin,
    {
        self.ptr
    }

    // 对于 T: !Unpin, 通过 unsafe fn 获得 &mut T
    unsafe fn get_unchecked_mut(self) -> &'a mut T {
        self.ptr
    }
}
```

这样做之后, 刚刚的 `swap` 代码就会报错:

```
error[E0596]: cannot borrow data in dereference of `MyPin<Box<SelfRef>>` as mutable
   --> src/main.rs:137:20
    |
137 |     std::mem::swap(&mut *pinned_a, &mut *pinned_b);
    |                    ^^^^^^^^^^^^^^ cannot borrow as mutable
    |
    = help: trait `DerefMut` is required to modify through a dereference, but it is not implemented for `MyPin<Box<SelfRef>>`

error[E0596]: cannot borrow data in dereference of `MyPin<Box<SelfRef>>` as mutable
   --> src/main.rs:137:36
    |
137 |     std::mem::swap(&mut *pinned_a, &mut *pinned_b);
    |                                    ^^^^^^^^^^^^^^ cannot borrow as mutable
    |
    = help: trait `DerefMut` is required to modify through a dereference, but it is not implemented for `MyPin<Box<SelfRef>>`
```

`MyPin<Box<SelfRef>>` 对应的 `Ptr` 是 `Box<SelfRef>`, 它的 `Target` 是 `SelfRef`, 而 `SelfRef: !Unpin`, 所以 `MyPin<Box<SelfRef>>` 没有实现 `DerefMut`, 无法构造 `&mut *pinned_a` 和 `&mut *pinned_b`.

此时如果还想强行 `swap`, 就只能写 `unsafe block`:

```rust
unsafe {
    let a_mut = pinned_a.as_mut().get_unchecked_mut();
    let b_mut = pinned_b.as_mut().get_unchecked_mut();
    std::mem::swap(a_mut, b_mut);
}
```

这就形成了用户和编译器之间的约定: 我需要 `&mut T`, 但是拿到 `&mut T` 之后, 编译器无法阻止我移动 `T`. 所以我通过 `unsafe block` 来保证, 我不会移动 `T`. 我最多做一些比如 `a_mut.v.push_str("world");` 之类, 需要修改, 但是不会移动 `T` 的操作. 这就完全由用户承诺了, 这也是 `unsafe block` 设计的初衷.

# 总结

1. 自引用结构在 Rust 里, 因为移动语义的存在, 而变得特别危险, 稍不注意就会破坏自引用结构(指针指向错误的地址)
2. 在 async/await 编译后的状态机代码中, 很容易出现自引用结构, 因为所有的变量都需要保存在状态机结构体中
3. 如果想移动一个 `T`, 必须获得 `&mut T`. `&mut T` 的有些操作会移动 `T`, 有些操作不会移动 `T`.
4. `Pin` 的原理非常简单, 就是通过将 `T` 的指针包裹起来, 然后根据 `T` 是否实现 `Unpin` 来提供不同的访问权限. 如果 `T: Unpin`, 那么权限就完全打开, 用户可以自由获得 `&T` 和 `&mut T`; 否则用户只能自由获得 `&T`, 想获得 `&mut T` 就只能通过 `unsafe block` 来实现, 并且在里面承诺自己不会移动 `T`.
