# anyhow 的设计原理

## 序言

`anyhow` 作为 rust 社区最流行的 crates 之一, 也是相对来说比较容易阅读的 crate. 本文会简单介绍 `anyhow` 的基本原理, 是如何在 rust 这种极其严谨的强类型静态语言里实现"任意错误类型"的. 如果你有 c/c++ 基础, 或许对你来说不是什么新鲜事, 你可能已经见识过这种常见的模式了. 但是如果很不幸你像我一样没有见识过, 那背后的黑魔法还是值得一挖的.

本文的目标是写一个简单的 `MyAny` 结构体, 让其实现类似 `anyhow` 里的装任意类型的功能, 并且可以 `downcast` 还原回具体类型. 会从最简单的 `Box<dyn Trait>` 开始, 然后一步步和 `anyhow` 的样子对齐.

```rust
use my_any::MyAny;

fn add(a: i32, b: i32) -> MyAny {
  MyAny::new(a + b)
}

fn main() {
    let mut result = add(1, 2);

    match result.downcast_ref::<i32>() {
        Some(sum) => println!("result is i32: {}", sum), // sum: &i32
        None => println!("result is not i32"),
    }

    match result.downcast_mut::<i32>() {
        Some(sum) => println!("result is i32: {}", sum), // sum: &mut i32
        None => println!("result is not i32"),
    }

    match result.downcast::<i32>() {
        Ok(sum) => println!("result is i32: {}", sum), // sum: i32
        Err(result) => println!("result is not i32"),  // result: MyAny
    }
}
```

## 1. Box\<dyn Any\> 版本

当我们要构建一个能装任意类型 `T` 的容器类型, 第一本能就是使用 trait object. 请注意绝对不能用泛型, 因为 `MyAny<T>` 和 `MyAny<U>` 是两个不同的类型. `anyhow::Error` 本身也不带任何泛型. 同时为了 `downcast` 时检查, 我们需要存放 `T` 的 `type_id`, 通过 `TypeId::of<T>()` 获得.
很容易写出以下代码:

```rust
use std::any::TypeId;

trait Any {}

impl<T> Any for T {}

struct MyAny {
    ptr: Box<dyn Any>,
    type_id: TypeId,
}

impl MyAny {
    fn new<T: Any + 'static>(value: T) -> Self {
        Self {
            ptr: Box::new(value),
            type_id: TypeId::of::<T>(),
        }
    }

    fn downcast<T: Any + 'static>(mut self) -> Result<T, Self> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = Box::into_raw(self.ptr).cast::<T>();
            let boxed = unsafe { Box::from_raw(raw_ptr) };

            Ok(*boxed)
        } else {
            Err(self)
        }
    }

    fn downcast_ref<T: Any + 'static>(&self) -> Option<&T> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = self.ptr.as_ref() as *const (dyn Any + 'static) as *const T;
            Some(unsafe { &*raw_ptr })
        } else {
            None
        }
    }

    fn downcast_mut<T: Any + 'static>(&mut self) -> Option<&mut T> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = self.ptr.as_mut() as *mut (dyn Any + 'static) as *mut T;
            Some(unsafe { &mut *raw_ptr })
        } else {
            None
        }
    }
}
```

其实核心思路非常简单:

1. 装到 `Box` 里, 通过 trait object 抹掉具体类型, 统一为 `Box<dyn Any + 'static>` 类型(因为需要 dyn 一个类型, 所以手动构造一个 `trait Any`)
2. 把真实的类型通过 `type_id` 记录下来, 这是 rust 编译器给每个类型分配的一个唯一 id
3. `downcast::<T>()` 的时候判断 `type_id` 是否匹配, 如果匹配就通过一系列 unsafe 的转换, 强制转成 `T`类型; 不匹配就走 unhappy path.

### 缺点

trait object 其实是一个胖指针, 占用两个 word, 第一个指向地址, 第二个指向 vtable, 所以一般来说一个 `Box<dyn Trait>` 会在栈上占用 16 个字节的大小, 而不是正常一个指针的 8 个字节, 直接翻倍了. 对于一个使用 `anyhow` 的大型项目来说, 基本函数都会返回 `Result<T, anyhow::Error>`. 如果返回 `Err(anyhow::Error)`, 这个值会沿着调用栈一步步传递, 所以 `anyhow` 希望把这个传递的值大小尽量做小, 减少拷贝成本, 于是 `anyhow` 采用的是栈上放裸指针, 裸指针指向一个堆上包含 vtable 的 `ErrorImpl` 结构体的方案, 这样 `size_of::<anyhow::Error>() == 8`, 每次函数返回/async 状态机保存就只需要 8 个字节, 而不是 16 个.

## 2. 裸指针版本

我们先不考虑大小的问题, 先把 `Box` 换成裸指针.

```rust
use std::any::TypeId;

struct MyAny {
    ptr: *mut (),
    type_id: TypeId,
}

impl MyAny {
    fn new<T: 'static>(value: T) -> Self {
        let boxed = Box::new(value);
        let ptr = Box::into_raw(boxed).cast::<()>();

        Self {
            ptr,
            type_id: TypeId::of::<T>(),
        }
    }

    fn downcast<T: 'static>(self) -> Result<T, Self> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = self.ptr.cast::<T>();
            let boxed = unsafe { Box::from_raw(raw_ptr) };

            Ok(*boxed)
        } else {
            Err(self)
        }
    }

    fn downcast_ref<T: 'static>(&self) -> Option<&T> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = self.ptr.cast::<T>();
            Some(unsafe { &*raw_ptr })
        } else {
            None
        }
    }

    fn downcast_mut<T: 'static>(&mut self) -> Option<&mut T> {
        if self.type_id == TypeId::of::<T>() {
            let raw_ptr = self.ptr.cast::<T>();
            Some(unsafe { &mut *raw_ptr })
        } else {
            None
        }
    }
}

fn add(a: i32, b: i32) -> MyAny {
  MyAny::new(a + b)
}

fn main() {
    let mut result = add(1, 2);

    match result.downcast::<i32>() {
        Ok(sum) => println!("result is i32: {}", sum), // sum: i32
        Err(result) => println!("result is not i32"),  // result: MyAny
    }
}
```

上面代码运行符合预期, 会打印 `result is i32: 3`. 接下来我们走一下 Err 分支, 也就是故意写错类型:

```rust
match result.downcast::<i64>() {
    Ok(sum) => println!("result is i32: {}", sum), // sum: i32
    Err(result) => println!("result is not i32"),  // result: MyAny
}
```

打印也符合预期: `result is not i32`, 看似一切都没问题, 但实际上隐藏了一个重大 bug: 内存泄露. 为了排查, 可以引入 [miri](https://github.com/rust-lang/miri), rust 官方的一个 UB(Undefined Behavior) 检查器.

```shell
rustup toolchain install nightly # 如果你没有 nightly, 首先安装 nightly, 因为 miri 必须在 nightly channel 下运行

rustup +nightly component add miri # 安装 miri

cargo +nightly miri run # 运行 miri
```

然后就会惊讶地发现报错了:

```
result is not i32
error: memory leaked: alloc284 (Rust heap, size: 4, align: 4), allocated here:
  --> src/bin/any.rs:10:21
   |
10 |         let boxed = Box::new(value);
   |                     ^^^^^^^^^^^^^^^
   |
   = note: stack backtrace:
```

报错信息显示 `Box::new(3)` 分配在堆上的 size 和 align 为 4 字节的内存发生了泄露(也就是 `i32`). 其实也不难理解, 在 `MyAny::new(3)` 里, 用 `let boxed = Box::new(3)` 分配了堆上的内存, 然后用 `Box::into_raw` 转为裸指针, 存到 `MyAny` 里, 此时这个 `boxed` 的所有权被传给了 `Box::into_raw`, 所以离开作用域时不会生成 drop glue, 此时的状态就是 ` result: MyAny` 里的 `ptr` 裸指针指向一块 `i32` 堆内存. 当 `Err` 分支执行完毕为 `MyAny` 生成 drop glue 时, 因为 `MyAny` 没有实现 `Drop`, 所以只会简单地清理掉栈上的 `ptr` 和 `type_id` 两个字段, 不会去清理 `ptr` 指向的堆内存, 一直持续到 `main` 函数返回都不会被清理, 所以内存泄露.

分析完毕, 修复方式也很显然: 给 `MyAny` 实现 `Drop`:

```rust
impl Drop for MyAny {
    fn drop(&mut self) {
        // ???
    }
}
```

但是 `drop` 具体应该怎么实现呢? `drop` 不带泛型, 所以我们不能像 `downcast` 那样直接还原成 `T`, 然后通过 `Box::from_raw` 来自动销毁. 另外, 绝对不能这样做:

```rust
impl Drop for MyAny {
    fn drop(&mut self) {
        let boxed = unsafe { Box::from_raw(self.ptr) };
        drop(boxed);
    }
}
```

这样获得的 `boxed` 类型为 `Box<()>`, 所以 `boxed` 被 drop 时会按照 `()` 的布局方式去销毁堆内存, 具体来说也就是什么也不会销毁, 因为 `()` 是 ZST(Zero-Sized Type).

此时就需要引入 `vtable` 了. 既然 `drop` 本身不能带泛型, 那我们保存一个带泛型的函数在 `MyAny` 里不就可以了.

```rust
struct MyAny {
    ptr: *mut (),
    type_id: TypeId,
    drop: fn(*mut ()), // 这个地方无法带泛型
}

fn drop_impl<T>(ptr: *mut ()) { // 参数只能是 *mut (), 因为 self.ptr 是 *mut ()
    let boxed = unsafe { Box::from_raw(ptr.cast::<T>()) };
    drop(boxed);
}

impl Drop for MyAny {
    fn drop(&mut self) {
        (self.drop)(self.ptr);
    }
}

impl MyAny {
    fn new<T: 'static>(value: T) -> Self {
        let boxed = Box::new(value);
        let ptr = Box::into_raw(boxed).cast::<()>();

        Self {
            ptr,
            type_id: TypeId::of::<T>(),
            drop: drop_impl::<T>, // 通过泛型函数实例化, 传入一个具体的 drop_impl 函数指针
        }
    }
}
```

这时候再执行 `miri`, 就不会报错了.

但是此时如果我们又切回 `Ok` 分支:

```rust
match result.downcast::<i32>() { // 改回正确类型, 走 Ok 分支
    Ok(sum) => println!("result is i32: {:?}", sum), // sum: i32
    Err(result) => println!("result is not i32"),    // result: MyAny
}
```

此时 `miri` 又会无情报错:

```
error: Undefined Behavior: constructing invalid value of type std::boxed::Box<i32>: encountered a dangling box (use-after-free)
```

问题出在 `downcast` 的实现里. 为了方便起见, 我们加一个 `let result = *boxed`:

```rust
fn downcast<T: 'static>(self) -> Result<T, Self> {
    if self.type_id == TypeId::of::<T>() {
        let raw_ptr = self.ptr.cast::<T>();
        let boxed = unsafe { Box::from_raw(raw_ptr) };
        let result = *boxed;

        Ok(result)
    } else {
        Err(self)
    }
}
```

加的这一行, 会干以下几件事:

1. 把 `boxed` 指向的 `i32` 按位拷贝到栈上, 放到 `result` 里.
2. 标记 `boxed` 为 moved.
3. `Box` 是一个非常特殊的结构, 编译器有特殊处理, 被解引用 move 后, 不会执行 `T::drop`, 但是会执行自己内部的 `dealloc`, 也就是把自己堆上那块内存回收. 这里的回收可以简单理解为, 告诉 `allocator` 这块内存回收了. 因为如果不这么做, 这块内存就泄露了.

此时倒是并没有什么问题, 只是发生了 first-free, `Ok(result)` 正常返回. 但是函数执行完毕后, 因为 `self` 是按值传递, 获得了所有权, 所以 `self` 本身会被销毁, 执行我们写的 `Drop` 实现, 再次把 `self.ptr` 指向的那块地址释放了一遍.

第一次 free 我们是没法控制的, 这是编译器为 `Box` 单独的处理, 所以只能阻止第二次 free, 也就是在 `downcast` 里阻止 `self` 被销毁:

```rust
fn downcast<T: 'static>(self) -> Result<T, Self> {
    if self.type_id == TypeId::of::<T>() {
        let this = ManuallyDrop::new(self); // 加一行 ManuallyDrop
        let raw_ptr = this.ptr.cast::<T>();
        let boxed = unsafe { Box::from_raw(raw_ptr) };

        Ok(*boxed)
    } else {
        Err(self)
    }
}
```

这个问题就解决了, `miri` 也不会报错了.

## 3. size 优化后的版本 - `MyAnyImpl`

版本 2 里, `MyAny` 的大小是 `32`: `ptr` = 8 + `type_id` = 16 + `drop` = 8, 而在前文我们提到, 由于 `anyhow::Error` 需要到处传递, 所以这个大小最好压缩到最小, 最直观的方法就是只存一个指针, 然后把其他所有字段全塞到堆上, 让指针指向这个值. 同时我们把裸指针替换成 `NonNull`.

```rust
struct MyAny {
    inner: NonNull<MyAnyImpl>,
}

#[repr(C)]
struct MyAnyImpl<T = ()> {
    drop: fn(NonNull<MyAnyImpl>),
    type_id: TypeId,
    value: T,
}

fn drop_impl<T>(ptr: NonNull<MyAnyImpl>) {
    let boxed = unsafe { Box::from_raw(ptr.as_ptr().cast::<MyAnyImpl<T>>()) };
    drop(boxed);
}

impl Drop for MyAny {
    fn drop(&mut self) {
        let drop = unsafe { self.inner.as_ref().drop };
        drop(self.inner);
    }
}

impl MyAny {
    fn new<T: 'static>(value: T) -> Self {
        let my_any_impl = MyAnyImpl {
            value,
            type_id: TypeId::of::<T>(),
            drop: drop_impl::<T>,
        };

        let boxed = Box::new(my_any_impl);
        let ptr = unsafe { NonNull::new_unchecked(Box::into_raw(boxed).cast::<MyAnyImpl>()) };

        Self { inner: ptr }
    }

    fn downcast<T: 'static>(self) -> Result<T, Self> {
        let type_id = unsafe { self.inner.as_ref().type_id };
        if type_id == TypeId::of::<T>() {
            let this = ManuallyDrop::new(self);

            let boxed = unsafe { Box::from_raw(this.inner.as_ptr().cast::<MyAnyImpl<T>>()) };

            Ok((*boxed).value)
        } else {
            Err(self)
        }
    }

    fn downcast_ref<T: 'static>(&self) -> Option<&T> {
        let type_id = unsafe { self.inner.as_ref().type_id };
        if type_id == TypeId::of::<T>() {
            let raw_ptr = self.inner.as_ptr().cast::<MyAnyImpl<T>>();
            Some(unsafe { &(*raw_ptr).value })
        } else {
            None
        }
    }

    fn downcast_mut<T: 'static>(&mut self) -> Option<&mut T> {
        let type_id = unsafe { self.inner.as_ref().type_id };
        if type_id == TypeId::of::<T>() {
            let raw_ptr = self.inner.as_ptr().cast::<MyAnyImpl<T>>();
            Some(unsafe { &mut (*raw_ptr).value })
        } else {
            None
        }
    }
}
```

这里要特别注意, 非常重要的两个点:

- repr(C)
- `MyAnyImpl` 的字段顺序, `value: T` 必须放在最后一个

原因是在 downcast 时, 我们需要获取存储的 `type_id`, 然后和 `T` 去对比. 但是此时 `self.inner` 的类型是 `MyAnyImpl<()>`, 通过指针访问这个结构体时, 会按照 `MyAnyImpl<()>`, 也就是只有 `drop`, `type_id` 两个字段的布局去访问, 所以需要保证这两个稳定的字段排在前面, 而 `value: T` 排在最后面, 这样才能保证指针指向正确的位置.

以下测试是我本地的结果. 举个例子, 假如我们把 `MyAnyImpl` 写成

```rust
struct MyAnyImpl<T = ()> {
    value: T,
    drop: fn(NonNull<MyAnyImpl>),
    type_id: TypeId,
}
```

此时 `MyAnyImpl` 的内存布局为:

1. offset 0: drop
2. offset 8: type_id
3. offset 24: value

假如我们真实存的类型是 `MyAnyImpl<i32>`, 此时内存布局为:

1. offset 0: drop
2. offset 8: type_id
3. offset 24: value

和 `MyAnyImpl` 一致, 不会有问题.

但是如果真实类型是 `MyAnyImpl<Vec<i32>>`, 此时内存布局为:

1. offset 0: value
2. offset 24: drop
3. offset 32: type_id

此时就炸了. `self.inner.as_ref().type_id` 拿到的指针会按照 `MyAnyImpl` 的布局去读取 `type_id`, 也就是 offset = 8 的位置, 但此时真实数据 `MyAnyImpl<Vec<i32>>`, offset = 8 的位置是 value, 也就是 `Vec<i32>` 的某个字段, 当然会报错了.

所以必须用 `repr(C)` + 把 `value: T` 放在最后一个位置的方法, 避免 rust 编译器的重排, 稳定访问除了 `value` 之外的字段.

## 4. context(wrapper) 版本

真正的 `anyhow::Error` 是支持 `context` 的, 也就是可以给错误附加一个 `context`. 当你使用

```rust
let content = std::fs::read(path)
        .with_context(|| format!("Failed to read instrs from {}", path))?;
```

时, `content` 的 `Err` 实际类型仍然是 `anyhow::Error`, 只不过里面的 `ErrorImpl` 包裹的是 `ContextError<C, E>`. `ContextError<C, E>` 的定义很简单:

```rust
#[repr(C)]
pub(crate) struct ContextError<C, E> {
    pub context: C,
    pub error: E,
}
```

也就是把你自己真实的错误类型 `E` 和传入的 `context` 放在一起而已, 整体当做一个 `Error`. 在这个场景下, **我们需要同时支持 `downcast` 到 `C` 和 `E`**.

这里再补充一个细节. 如果是第一次给普通的 `Result<T, E>` 添加 context, `anyhow` 可以直接把 `ContextError<C, E>` 放进同一块 allocation. 但是如果被包装的错误已经是 `anyhow::Error`, 里面的 `E` 就会变成 `anyhow::Error`, 也就是 `ContextError<C, anyhow::Error>`. 每多加一次 context, 链表上就会再多一个节点. 本文暂时不考虑第一种优化, 下面的 `MyAny::wrap` 固定接收一个 `MyAny`, 专门模拟后面这种链式结构.

现在我们来尝试模拟, 允许 `MyAnyImpl` 的真实值携带一个 `context`.

```rust
impl MyAny {
    fn wrap<C: 'static>(context: C, inner: MyAny) -> Self {
        let wrapper = Wrapper { context, inner };

        let my_any_impl = MyAnyImpl {
            value: wrapper,
            type_id: TypeId::of::<Wrapper<C, MyAny>>(),
            drop: drop_impl::<Wrapper<C, MyAny>>,
        };

        let boxed = Box::new(my_any_impl);
        let erased_ptr = Box::into_raw(boxed).cast::<MyAnyImpl>();
        let ptr = unsafe { NonNull::new_unchecked(erased_ptr) };

        Self { inner: ptr }
    }
}

mod wrapper {
    #[repr(C)]
    pub struct Wrapper<C, T> {
        pub context: C,
        pub inner: T,
    }
}

fn main() {
    let wrapped = MyAny::wrap("owned-context".to_string(), MyAny::new(123));
    // 可以 downcast 到 context 的类型
    match wrapped.downcast_ref::<String>() {
        Some(ctx) => {
            println!("context is : {ctx}");
        }
        None => panic!(),
    }

    // 也可以 downcast 到 value 的类型
    match wrapped.downcast_ref::<i32>() {
        Some(value) => {
            println!("value is : {value}");
        }
        None => panic!(),
    }
}
```

现在去修改 `MyAny::downcast` 的实现, 会发现一个巨大的问题: `self` 里存的 `type_id` 只有一个, 即自己的 `inner` 指针指向的类型, 而 `C` 是在这个类型里面的. 所以在当前的 `downcast` 实现里面, 对于一个 `wrapped`, 我们根本就做不到 `downcast::<C>` 和 `downcast::<T>`, 因为 `C` 和 `T` 都藏在下一层. 这一层拿到的 `type_id` 信息只有 `Wrapper<C, MyAny>`.

其实这个时候, `wrapped` 本质上成了一个"链表". 当前这一层的 `context` 是 `owned-context`, 然后下一层是叶子节点, 没有 `context`, `value` 是 `123`, 所以在实现 `downcast` 的时候需要递归处理.

你或许会想, 那我们给 `MyAnyImpl` 再加一个 `context_type_id: Option<TypeId>` 不就可以了? 是的, 这样可以解决 `downcast::<C>` 的问题, 但是依然无法解决 `downcast::<T>` 的问题, 因为 `T` 依然藏在下一层节点里. 如果你想抽丝剥茧进入下一层, 你还需要先对比当前的 `type_id == TypeId::of::<Wrapper<C, T>>()`, 但是这个时候是没有 `C` 的, 写不出来.

上面问题本质上是 `type_id` 是对于**当前这一层存储的类型**的值, 但是无法定义**当前这一层存储的类型应该如何做 `downcast`**这个行为, 而这种行为正是 `vtable` 解决的问题. 所以我们需要增加一个叫做 `downcast` 的函数, 放到 `MyAnyImpl` 里. 但是如果直接放进去, 又会有一个问题: 随着函数的增多, 每增多一个函数指针字段, `MyAnyImpl` 大小就会增加 8 个字节. 所以一般来说会抽出一个 `vtable: &'static VTABLE` 字段, 把所有的函数指针塞进去, 这样只占用一个指针大小, 并且当一个具体的 `MyAnyImpl<T>` 被创建 N 次时, 也只会共享同一个 `vtable`.

由于 `downcast` 的行为已经被下放到了 `vtable.downcast` 里, 所以 `type_id` 也可以去掉了, 因为 `vtable.downcast` 在创建时可以用具体的类型去单态化.

```rust
use std::{any::TypeId, mem::ManuallyDrop, ptr::NonNull};

use crate::wrapper::Wrapper;

struct MyAny {
    inner: NonNull<MyAnyImpl>,
}

struct VTABLE {
    drop: fn(NonNull<MyAnyImpl>),
    downcast: fn(NonNull<MyAnyImpl>, target: TypeId) -> Option<NonNull<()>>,
}

#[repr(C)]
struct MyAnyImpl<T = ()> {
    vtable: &'static VTABLE,
    value: T,
}

fn drop_impl<T>(ptr: NonNull<MyAnyImpl>) {
    let boxed = unsafe { Box::from_raw(ptr.as_ptr().cast::<MyAnyImpl<T>>()) };
    drop(boxed);
}

fn downcast_impl<T: 'static>(ptr: NonNull<MyAnyImpl>, target: TypeId) -> Option<NonNull<()>> {
    if TypeId::of::<T>() == target {
        let unerased_ptr = ptr.as_ptr().cast::<MyAnyImpl<T>>();
        let value_ptr = unsafe { std::ptr::addr_of_mut!((*unerased_ptr).value) };
        let erased_ptr = value_ptr.cast::<()>();
        unsafe { Some(NonNull::new_unchecked(erased_ptr)) }
    } else {
        None
    }
}

impl MyAny {
    fn new<T: 'static>(value: T) -> Self {
        let vtable = &VTABLE {
            drop: drop_impl::<T>,
            downcast: downcast_impl::<T>,
        };

        let my_any_impl = MyAnyImpl { vtable, value };

        let boxed = Box::new(my_any_impl);
        let ptr = unsafe { NonNull::new_unchecked(Box::into_raw(boxed).cast::<MyAnyImpl>()) };

        Self { inner: ptr }
    }

    fn downcast<T: 'static>(self) -> Result<T, Self> {
        let target = TypeId::of::<T>();
        let vtable = unsafe { self.inner.as_ref().vtable };
        match (vtable.downcast)(self.inner, target) {
            Some(result) => {
                let this = ManuallyDrop::new(self);

                let unerased_ptr = result.as_ptr().cast::<T>();
                let value = unsafe { std::ptr::read(unerased_ptr) };

                Ok(value)
            }
            None => Err(self),
        }
    }

    fn downcast_ref<T: 'static>(&self) -> Option<&T> {
        let target = TypeId::of::<T>();
        let vtable = unsafe { self.inner.as_ref().vtable };
        match (vtable.downcast)(self.inner, target) {
            Some(result) => {
                let unerased_ptr = result.as_ptr().cast::<T>();

                unsafe { unerased_ptr.as_ref() }
            }
            None => None,
        }
    }

    fn downcast_mut<T: 'static>(&mut self) -> Option<&mut T> {
        let target = TypeId::of::<T>();
        let vtable = unsafe { self.inner.as_ref().vtable };
        let result = (vtable.downcast)(self.inner, target)?;

        Some(unsafe { &mut *result.as_ptr().cast::<T>() })
    }

    fn wrap<C: 'static>(context: C, inner: MyAny) -> Self {
        let wrapper = Wrapper { context, inner };
        let vtable = &VTABLE {
            drop: drop_impl::<Wrapper<C, MyAny>>,
            downcast: crate::wrapper::downcast_impl::<C>,
        };

        let my_any_impl = MyAnyImpl {
            value: wrapper,
            vtable,
        };

        let boxed = Box::new(my_any_impl);
        let erased_ptr = Box::into_raw(boxed).cast::<MyAnyImpl>();
        let ptr = unsafe { NonNull::new_unchecked(erased_ptr) };

        Self { inner: ptr }
    }
}

impl Drop for MyAny {
    fn drop(&mut self) {
        let drop = unsafe { self.inner.as_ref().vtable.drop };
        drop(self.inner);
    }
}

mod wrapper {
    use std::{any::TypeId, ptr::NonNull};

    use crate::{MyAny, MyAnyImpl};

    #[repr(C)]
    pub struct Wrapper<C, T> {
        pub context: C,
        pub inner: T,
    }

    pub fn downcast_impl<C: 'static>(
        ptr: NonNull<MyAnyImpl>,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        let wrapper_ptr = ptr.cast::<MyAnyImpl<Wrapper<C, MyAny>>>().as_ptr();
        if TypeId::of::<C>() == target {
            let unerased_context_ptr =
                unsafe { std::ptr::addr_of_mut!((*wrapper_ptr).value.context) };

            unsafe { Some(NonNull::new_unchecked(unerased_context_ptr.cast::<()>())) }
        } else {
            let inner_vtable = unsafe { (*wrapper_ptr).value.inner.inner.as_ref().vtable };
            unsafe { (inner_vtable.downcast)((*wrapper_ptr).value.inner.inner, target) }
        }
    }
}

fn main() {
    let wrapped = MyAny::wrap("owned-context".to_string(), MyAny::new(123));
    match wrapped.downcast_ref::<String>() {
        Some(ctx) => {
            println!("context is : {ctx}");
        }
        None => panic!(),
    }

    match wrapped.downcast_ref::<i32>() {
        Some(value) => {
            println!("value is : {value}");
        }
        None => panic!(),
    }

    match wrapped.downcast::<String>() {
        Ok(ctx) => {
            println!("context is : {ctx}");
        }
        Err(e) => panic!(),
    }
}
```

可以看到, 叶子节点的 `downcast` 和 `wrapped` 的 `downcast` 实现有区别了, 后者会先尝试 `downcast` 到 `C`, 如果不匹配, 再调用自己内部包裹的 `MyAnyImpl` 的 `vtable.downcast`, 递归处理.

但是上面的代码如果用 `miri` 来运行, 会很残忍地抛出内存泄露错误, 因为在最后我们调用 `wrapped.downcast::<String>()` 后, 把 `context: String` move 出来, 作用域结束就 `drop` 了, 但是由于 `ManuallyDrop` 的存在, `self`, 也就是整个外层的 `MyAny` 是没有 `drop` 的, 此时里面还残留着 `inner` 在堆上分配的 `inner` ptr, 外加这个 ptr 指向的一整块的叶子`MyAny`. 但是如果去掉 `ManuallyDrop`, 又会导致 `context` 出现 double free, 第一次在 `self` 离开作用域时, 第二次在 `ctx` 离开作用域时.

所以此时 `vtable` 需要引入另一个函数: `drop_rest`.

```rust
struct VTABLE {
    drop: fn(NonNull<MyAnyImpl>),
    downcast: fn(NonNull<MyAnyImpl>, target: TypeId) -> Option<NonNull<()>>,
    drop_rest: fn(NonNull<MyAnyImpl>, target: TypeId),
}
```

为什么叫 `drop_rest` 呢? 因为在 `downcast::<T>()` 成功时, 我们已经通过 `ptr::read` 把某个 `T` 从整条链里 move 出去了. 这个 `T` 的所有权已经交给调用方, 不能再 drop 第二次, 但是除了 `T` 以外的 context, wrapper 和堆内存还是要正常清理. 换句话说, `drop_rest` 要做的就是: **留下已经被拿走的 `T`, 把剩下的东西全 drop 掉**.

先看最简单的叶子节点. 叶子节点的 `value` 就是 `T` 本身, 既然它已经被 move 出去了, 那么把 `T` 换成 `ManuallyDrop<T>` 再销毁整个 `Box` 就可以了:

```rust
fn drop_rest_impl<T: 'static>(ptr: NonNull<MyAnyImpl>, _target: TypeId) {
    let boxed = unsafe { Box::from_raw(ptr.as_ptr().cast::<MyAnyImpl<ManuallyDrop<T>>>()) };
    drop(boxed);
}
```

`ManuallyDrop<T>` 和 `T` 的 layout 完全一致, 区别只是前者不会执行 `T::drop`. 所以这里的 `drop(boxed)` 仍然会释放 `MyAnyImpl` 占用的堆内存, 但是不会再 drop 已经被 `ptr::read` 拿走的 `T`. 叶子节点里 `target` 参数用不上, 只是为了让所有 `drop_rest` 保持相同的函数签名.

然后把它塞到叶子节点的 vtable 里:

```rust
let vtable = &VTABLE {
    drop: drop_impl::<T>,
    downcast: downcast_impl::<T>,
    drop_rest: drop_rest_impl::<T>,
};
```

`MyAny::downcast` 也要在拿走 `value` 后调用 `drop_rest`:

```rust
fn downcast<T: 'static>(self) -> Result<T, Self> {
    let target = TypeId::of::<T>();
    let vtable = unsafe { self.inner.as_ref().vtable };
    match (vtable.downcast)(self.inner, target) {
        Some(result) => {
            let this = ManuallyDrop::new(self);

            let unerased_ptr = result.as_ptr().cast::<T>();
            let value = unsafe { std::ptr::read(unerased_ptr) };

            unsafe {
                (this.inner.as_ref().vtable.drop_rest)(this.inner, target);
            }

            Ok(value)
        }
        None => Err(self),
    }
}
```

这里再顺一遍 `Some(result)` 分支具体干了什么:

1. `vtable.downcast` 在整条链里找到 `T` 的地址.
2. 用 `ManuallyDrop::new(self)` 阻止最外层 `MyAny` 自动执行 `Drop`.
3. 用 `ptr::read` 把 `T` 从原来的位置按位读出来, 所有权交给局部变量 `value`.
4. 从最外层开始调用 `drop_rest`, 一层一层销毁除了 `T` 以外的所有东西.

叶子节点很简单, 但是 wrapper 节点就麻烦了. 我们先写一个看起来没问题的版本:

```rust
pub fn drop_rest_impl<C: 'static>(
    ptr: NonNull<MyAnyImpl>,
    target: TypeId,
) {
    if TypeId::of::<C>() == target {
        // downcast 到当前这一层的 context, 所以跳过 C, 正常 drop inner
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>>(),
            )
        };
        drop(boxed);
    } else {
        // downcast 到 inner 里的值, 所以正常 drop C, 跳过 inner
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<C, ManuallyDrop<MyAny>>>>(),
            )
        };
        drop(boxed);
    }
}
```

如果拿走的是当前这一层的 `context: C`, 就把真实类型

```rust
MyAnyImpl<Wrapper<C, MyAny>>
```

强转成

```rust
MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>
```

这样 drop 时会跳过已经被拿走的 `C`, 但是正常销毁后面的 `MyAny`, 所以内层整条链也会跟着正常销毁.

如果拿走的是 `inner` 里的某个值, 就反过来把它强转成

```rust
MyAnyImpl<Wrapper<C, ManuallyDrop<MyAny>>>
```

这样当前这一层的 `C` 会正常 drop, `inner` 则不会执行 `MyAny::drop`, 避免把已经被 move 出去的目标值一起销毁. 看起来非常合理, 跑一下当前的测试:

```rust
let origin = MyAny::new(42);
let w1 = MyAny::wrap("c1".to_string(), origin);
let w2 = MyAny::wrap("c2".to_string(), w1);

match w2.downcast::<String>() {
    Ok(ctx) => println!("context is: {ctx}"),
    Err(_) => panic!(),
}
```

打印 `context is: c2`, `miri` 也没有报错, 难道这就结束了吗? 很不幸, 这个测试其实是在骗自己. `w1` 和 `w2` 的 context 都是 `String`, 所以 `downcast::<String>` 在最外层的 `c2` 就匹配成功了, 根本没有进入 `else` 分支. 我们把目标类型改成最里面的 `i32`:

```rust
match w2.downcast::<i32>() {
    Ok(value) => println!("value is: {value}"),
    Err(_) => panic!(),
}
```

此时值倒是可以正常打印出来:

```text
value is: 42
```

但是 `miri` 马上就会报出多处内存泄露, 其中既有 `MyAny::wrap` 分配的 wrapper, 也有 `MyAny::new` 分配的叶子节点.

问题就出在刚才那个看似合理的 `else` 分支. `ManuallyDrop<MyAny>` 确实阻止了 `inner` 执行 `MyAny::drop`, 当前这一层的 `context` 和 allocation 也确实被释放了. 但是 `inner` 自己还存着一个指向下一层 allocation 的裸指针, 现在连 `inner` 都一起消失了, 这个裸指针指向的整条链当然也就永远找不回来了.

所以这里只做到"跳过 inner"是不够的. 在 drop 当前节点之前, 必须先把下一层的指针保存下来, 当前节点清理完毕后, 再调用下一层 vtable 里的 `drop_rest`, 继续递归:

```rust
pub fn drop_rest_impl<C: 'static>(
    ptr: NonNull<MyAnyImpl>,
    target: TypeId,
) {
    if TypeId::of::<C>() == target {
        // 当前这一层的 context 已经被 move 出去,
        // 跳过 C, 正常 drop inner
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>>(),
            )
        };
        drop(boxed);
    } else {
        // 目标值在 inner 里, 正常 drop C,
        // 暂时跳过 inner, 然后递归清理下一层
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<C, ManuallyDrop<MyAny>>>>(),
            )
        };
        let inner = boxed.value.inner.inner;
        drop(boxed);

        let inner_vtable = unsafe { inner.as_ref().vtable };
        (inner_vtable.drop_rest)(inner, target);
    }
}
```

`let inner = boxed.value.inner.inner` 里的第一个 `inner` 是 `Wrapper::inner`, 第二个 `inner` 是 `MyAny::inner`. 最终拿到的是下一层的 `NonNull<MyAnyImpl>`, 而 `NonNull` 本身是 `Copy` 的, 所以可以在释放 `boxed` 之前把它保存到栈上.

这里又在利用 layout 做一些危险操作. 上面的强转之所以成立, 依赖以下两个条件:

1. `MyAnyImpl` 和 `Wrapper` 都必须是 `#[repr(C)]`.
2. `ManuallyDrop<T>` 和 `T` 必须拥有相同的 layout.

这样把 `C` 或者 `MyAny` 替换成 `ManuallyDrop` 后, 其他字段的 offset 和整个 allocation 的 layout 才不会变化. 如果把 `Wrapper` 上面的 `#[repr(C)]` 去掉, 就又会回到上一节字段可能被 rust 编译器重排的问题里.

最后别忘了给 wrapper 的 vtable 填上对应的 `drop_rest`:

```rust
let vtable = &VTABLE {
    drop: drop_impl::<Wrapper<C, MyAny>>,
    downcast: crate::wrapper::downcast_impl::<C>,
    drop_rest: crate::wrapper::drop_rest_impl::<C>,
};
```

`downcast_ref` 和 `downcast_mut` 就没有这么麻烦了, 因为它们只是借用, 不会把任何值从链表里 move 出去, 最后整个 `MyAny` 依然可以走普通的 `Drop`. 两者直接复用 `vtable.downcast` 找到地址即可, `downcast_mut` 的独占性则由 `&mut self` 保证.

现在用两个不同类型的 context 再测试一遍:

```rust
let origin = MyAny::new(42);
let inner = MyAny::wrap("inner-context", origin);
let mut outer = MyAny::wrap("outer-context".to_string(), inner);

assert_eq!(
    outer.downcast_ref::<String>().map(String::as_str),
    Some("outer-context"),
);
assert_eq!(
    outer.downcast_ref::<&'static str>().copied(),
    Some("inner-context"),
);

*outer.downcast_mut::<i32>().unwrap() += 1;

match outer.downcast::<i32>() {
    Ok(value) => println!("value is: {value}"),
    Err(_) => panic!(),
}
```

最终打印 `value is: 43`. 这次 owned downcast 的目标是最深处的 `i32`, 所以一定会经过 wrapper 的递归 `downcast` 和递归 `drop_rest`. 为了再保险一点, 我又分别测试了拿走最外层 context, 中间 context, 叶子节点和 downcast 失败这几种情况, 并且给每一层放了一个 drop counter, 保证除了被拿走的值之外, 其他值都只会 drop 一次.

最后执行:

```shell
cargo +nightly miri test --bin any4
```

5 个测试全部通过, 没有内存泄露, 也没有 double free. 到这里, 这个 `MyAny` 才算真正支持了 context: 栈上的大小依然只有一个指针, 但是可以沿着 wrapper 链 downcast 到任意一层, owned downcast 之后也能正确清理剩下的所有节点.

## 5. 智能指针版本 - `Own`, `Ref`, `Mut`

上面的版本已经可以基本 work 了, 但是如果你去翻 `anyhow` 源码, 你会发现他并没有到处直接传 `NonNull`, 而是自己封装了三个指针结构: [Own<T>](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L6-L11), [Ref](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L64-L70), [Mut](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L125-L131).

第一眼看上去可能会觉得有点莫名其妙. 三个结构体里面不都是同一个 `NonNull<T>` 吗? 好不容易把 `Box` 换成裸指针, 现在又额外写了三种壳, 到底图什么?

回头看一下 any4 里的 vtable:

```rust
struct VTABLE {
    drop: fn(NonNull<MyAnyImpl>),
    downcast: fn(NonNull<MyAnyImpl>, TypeId) -> Option<NonNull<()>>,
    drop_rest: fn(NonNull<MyAnyImpl>, TypeId),
}
```

这里所有函数接收的都是 `NonNull<MyAnyImpl>`, `downcast` 返回的也是一个没有任何信息的 `NonNull<()>`. 但是这些看起来完全一样的裸指针, 实际上承担了三种完全不同的职责:

1. `drop` 和 `drop_rest` 拿到的指针拥有整块 allocation, 可以通过 `Box::from_raw` 把它释放掉.
2. `downcast_ref` 里的指针只是从 `&self` 临时借来的, 只能读, 而且绝对不能活得比 `self` 更久.
3. `downcast_mut` 里的指针是从 `&mut self` 借来的, 可以修改, 但是同一时间不能再出现其他引用.

问题就在这里: 我们前面只擦除了具体的 `T`, 但是一不小心把指针的所有权, 借用方式和生命周期也一起擦除了. 对 rust 编译器来说, 上面三种指针全都是 `NonNull`, 完全没有区别.

比如下面这种离谱操作, 从类型上看居然没有任何问题:

```rust
let ptr = self.inner; // NonNull<MyAnyImpl>
(vtable.drop)(ptr);   // 可以释放
(vtable.downcast)(ptr, target); // 还可以接着访问
```

当然真正执行时大概率直接 use-after-free. 但是编译器帮不上任何忙, 因为 `NonNull` 既没有表示"这块内存已经被释放", 也没有表示它到底来自 `&self`, `&mut self` 还是一个拥有所有权的 `Box`.

`NonNull::as_ref` 和 `NonNull::as_mut` 也有类似的问题. 它们返回的引用生命周期不是根据某个原始引用自动推导出来的, 而是由调用 unsafe 的人自己保证. any4 最外层的 `downcast_ref(&self) -> Option<&T>` 碰巧通过函数签名把返回值限制在了 `&self` 的生命周期里, 但是一旦进入 vtable 再递归几层, 中间传递的只剩下一堆裸指针, 每一层都需要人肉记住这个指针最开始是怎么来的.

所以 `Own`, `Ref`, `Mut` 解决的不是运行时问题, 而是**把被裸指针擦掉的权限信息重新放回类型系统里**.

先看 `Own`:

```rust
#[repr(transparent)]
struct Own<T> {
    ptr: NonNull<T>,
}

impl<T> Copy for Own<T> {}

impl<T> Clone for Own<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Own<T> {
    fn new(boxed: Box<T>) -> Self {
        Self {
            ptr: unsafe { NonNull::new_unchecked(Box::into_raw(boxed)) },
        }
    }

    fn cast<U>(self) -> Own<U> {
        Own {
            ptr: self.ptr.cast(),
        }
    }

    unsafe fn boxed(self) -> Box<T> {
        unsafe { Box::from_raw(self.ptr.as_ptr()) }
    }

    fn by_ref(&self) -> Ref<'_, T> {
        Ref {
            ptr: self.ptr,
            lifetime: PhantomData,
        }
    }

    fn by_mut(&mut self) -> Mut<'_, T> {
        Mut {
            ptr: self.ptr,
            lifetime: PhantomData,
        }
    }
}
```

`Own<T>` 表示这个指针背后的 allocation 归当前 `MyAny` 所有. 只有 `Own<T>` 提供 `boxed`, 所以想调用 `Box::from_raw` 回收内存, 手里必须先有一个 `Own<T>`. 同时它可以通过 `by_ref` 和 `by_mut` 暂时借出 `Ref` 和 `Mut`, 这和从一个普通的值上获取 `&T` 和 `&mut T` 是同一个方向:

```text
                 ┌── by_ref() ──> Ref<'a, T>
Own<T> ──────────┤
                 └── by_mut() ──> Mut<'a, T>
```

反过来则不行. `Ref` 和 `Mut` 都没有 `boxed` 方法, 所以一个只负责查找目标值的 downcast 函数, 不应该顺手把整个 allocation 释放掉.

接下来是 `Ref`:

```rust
#[repr(transparent)]
struct Ref<'a, T> {
    ptr: NonNull<T>,
    lifetime: PhantomData<&'a T>,
}

impl<T> Copy for Ref<'_, T> {}

impl<T> Clone for Ref<'_, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'a, T> Ref<'a, T> {
    fn new(value: &'a T) -> Self {
        Self {
            ptr: NonNull::from(value),
            lifetime: PhantomData,
        }
    }

    fn cast<U>(self) -> Ref<'a, U> {
        Ref {
            ptr: self.ptr.cast(),
            lifetime: PhantomData,
        }
    }

    unsafe fn deref(self) -> &'a T {
        unsafe { &*self.ptr.as_ptr() }
    }
}
```

`Ref<'a, T>` 里面除了裸指针, 还多了一个 `PhantomData<&'a T>`. `PhantomData` 自己不占任何内存, 但是它会告诉编译器: "你就把我当成真的持有一个 `&'a T`, 生命周期和共享借用规则全部照常检查".

这样当 `Ref<'a, MyAnyImpl>` 沿着 wrapper 一层层递归时, `'a` 也会一起传下去. 最后找到目标值后返回的 `Ref<'a, ()>`, 依然不能活得比最外层的 `&self` 更久. 中间无论经过多少层 vtable, 生命周期都不会再凭空消失.

`Mut` 和它基本一样, 只是 `PhantomData` 里放的是 `&'a mut T`:

```rust
#[repr(transparent)]
struct Mut<'a, T> {
    ptr: NonNull<T>,
    lifetime: PhantomData<&'a mut T>,
}

impl<T> Copy for Mut<'_, T> {}

impl<T> Clone for Mut<'_, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'a, T> Mut<'a, T> {
    fn new(value: &'a mut T) -> Self {
        Self {
            ptr: NonNull::from(value),
            lifetime: PhantomData,
        }
    }

    fn cast<U>(self) -> Mut<'a, U> {
        Mut {
            ptr: self.ptr.cast(),
            lifetime: PhantomData,
        }
    }

    unsafe fn deref_mut(self) -> &'a mut T {
        unsafe { &mut *self.ptr.as_ptr() }
    }
}

impl<T> Mut<'_, T> {
    unsafe fn read(self) -> T {
        unsafe { self.ptr.as_ptr().read() }
    }
}
```

`Mut<'a, T>` 表示这个指针来自一次独占借用. 它既可以在 `downcast_mut` 里还原成 `&'a mut T`, 也可以在 owned downcast 里通过 `ptr::read` 把 `T` move 出去. 但是它不能回收 allocation, 最后的释放工作仍然只能交给 `Own`.

这三个结构体都用了 `#[repr(transparent)]`, `PhantomData` 又是 ZST, 所以它们在 64 位机器上的大小依然全都是 8:

```rust
assert_eq!(size_of::<Own<MyAnyImpl>>(), 8);
assert_eq!(size_of::<Ref<'static, MyAnyImpl>>(), 8);
assert_eq!(size_of::<Mut<'static, MyAnyImpl>>(), 8);
```

也就是说, 这三层壳在运行时什么都没有增加, 里面还是原来那个裸指针. 它们唯一增加的东西存在于编译期: 现在函数签名终于可以说清楚自己到底需要哪一种指针.

于是 any5 里的 vtable 变成:

```rust
struct VTABLE {
    drop: unsafe fn(Own<MyAnyImpl>),
    downcast_ref:
        for<'a> unsafe fn(Ref<'a, MyAnyImpl>, TypeId) -> Option<Ref<'a, ()>>,
    downcast_mut:
        for<'a> unsafe fn(Mut<'a, MyAnyImpl>, TypeId) -> Option<Mut<'a, ()>>,
    drop_rest: unsafe fn(Own<MyAnyImpl>, TypeId),
}
```

这里顺便把所有函数指针都改成了 `unsafe fn`. `Own`, `Ref`, `Mut` 可以表达指针拥有什么权限, 但是它们并不知道被擦除之前的真实类型是不是 vtable 声称的那个类型. 比如 `drop_impl::<String>` 收到的 allocation 里到底是不是 `MyAnyImpl<String>`, 依然只能靠创建 vtable 时保证, 所以这些函数本身当然还是 unsafe.

这几个函数签名基本已经把规则写在脸上了:

1. `drop` 和 `drop_rest` 会销毁 allocation, 所以必须接收 `Own<MyAnyImpl>`.
2. `downcast_ref` 只能接收 `Ref<'a, MyAnyImpl>`, 并且只能返回同一个生命周期 `'a` 下的 `Ref<'a, ()>`.
3. `downcast_mut` 只能接收 `Mut<'a, MyAnyImpl>`, 返回值也必须是同一个独占借用里的 `Mut<'a, ()>`.

这里的 `for<'a>` 意思是这个函数必须对任意生命周期 `'a` 都成立. 输入是什么生命周期, 输出就老老实实使用什么生命周期, 不能偷偷返回一个 `'static`.

不过真正的 `anyhow` 源码并没有显式写出 `for<'a>`, 原始定义是:

```rust
object_downcast: unsafe fn(Ref<ErrorImpl>, TypeId) -> Option<Ref<()>>,
```

这里只是利用了 rust 的 lifetime elision. 输入 `Ref<ErrorImpl>` 里省略的生命周期会变成一个泛型生命周期 `'a`, 因为输入里只有这一个生命周期, 所以输出 `Ref<()>` 省略的生命周期也会绑定到同一个 `'a`. 完整展开后, 才是 any5 里显式写出的:

```rust
for<'a> unsafe fn(
    Ref<'a, MyAnyImpl>,
    TypeId,
) -> Option<Ref<'a, ()>>
```

any5 故意不省略, 只是为了把"输入什么生命周期, 输出就是什么生命周期"这件事直接摆出来, 并不是说 `anyhow` 源码真的写了这几个字符.

现在如果把 `Ref` 误传给 `drop`, 连编译都过不了:

```rust
let borrowed = self.inner.by_ref();
(vtable.drop)(borrowed);
// expected Own<MyAnyImpl>, found Ref<'_, MyAnyImpl>
```

这才是这三个指针最主要的价值. unsafe 并没有消失, 指针 cast 错了照样会炸, 但是以前所有函数都收 `NonNull`, 只能靠人脑维护约定; 现在最起码把"谁可以释放, 谁只能读, 谁可以写, 引用能活多久"放进了类型签名, 很多明显传错权限的 bug 会直接变成编译错误.

`MyAny` 里面存的指针也从 `NonNull` 换成 `Own`:

```rust
struct MyAny {
    inner: Own<MyAnyImpl>,
}
```

创建 `MyAny` 时, 先用 `Own::new` 接管 `Box` 的所有权, 然后再擦除具体的 `T`:

```rust
let my_any_impl = MyAnyImpl { vtable, value };
let inner = Own::new(Box::new(my_any_impl)).cast::<MyAnyImpl>();

Self { inner }
```

后面每个操作都需要先读取 `MyAnyImpl` 的第一个字段 `vtable`, 为了避免到处重复写, 再抽出一个函数:

```rust
unsafe fn vtable(ptr: NonNull<MyAnyImpl>) -> &'static VTABLE {
    unsafe { *(ptr.as_ptr() as *const &'static VTABLE) }
}
```

这个函数依赖 `MyAnyImpl` 是 `#[repr(C)]` 并且 `vtable` 永远排在第一个字段, 和上一节通过 erased pointer 读取公共头部是同一个原理.

普通的 `Drop` 只能把 `Own` 交给 vtable:

```rust
impl Drop for MyAny {
    fn drop(&mut self) {
        let vtable = unsafe { vtable(self.inner.ptr) };
        unsafe { (vtable.drop)(self.inner) };
    }
}

unsafe fn drop_impl<T>(ptr: Own<MyAnyImpl>) {
    let unerased = ptr.cast::<MyAnyImpl<T>>();
    drop(unsafe { unerased.boxed() });
}
```

而 `downcast_ref` 和 `downcast_mut` 必须先从 `Own` 借出正确的指针类型:

```rust
fn downcast_ref<T: 'static>(&self) -> Option<&T> {
    let inner = self.inner.by_ref();
    let vtable = unsafe { vtable(inner.ptr) };
    let addr = unsafe { (vtable.downcast_ref)(inner, TypeId::of::<T>()) }?;

    Some(unsafe { addr.cast::<T>().deref() })
}

fn downcast_mut<T: 'static>(&mut self) -> Option<&mut T> {
    let inner = self.inner.by_mut();
    let vtable = unsafe { vtable(inner.ptr) };
    let addr = unsafe { (vtable.downcast_mut)(inner, TypeId::of::<T>()) }?;

    Some(unsafe { addr.cast::<T>().deref_mut() })
}
```

从这段代码已经可以很直观地看出两条不同的路径:

```text
&self     -> Ref<MyAnyImpl> -> Ref<()> -> &T
&mut self -> Mut<MyAnyImpl> -> Mut<()> -> &mut T
```

owned downcast 稍微特殊一点. 它最终要把 `T` move 出去, 所以先通过 `Mut` 找到目标地址并执行 `read`, 然后再把最外层的 `Own` 交给 `drop_rest`:

```rust
fn downcast<T: 'static>(mut self) -> Result<T, Self> {
    let target = TypeId::of::<T>();
    let addr = {
        let inner = self.inner.by_mut();
        let vtable = unsafe { vtable(inner.ptr) };
        match unsafe { (vtable.downcast_mut)(inner, target) } {
            Some(addr) => addr,
            None => return Err(self),
        }
    };

    let value = unsafe { addr.cast::<T>().read() };
    let outer = ManuallyDrop::new(self);
    let vtable = unsafe { vtable(outer.inner.ptr) };
    unsafe { (vtable.drop_rest)(outer.inner, target) };

    Ok(value)
}
```

这里的权限变化也很清楚:

1. `self.inner.by_mut()` 暂时借出一个 `Mut`, 用来递归查找并 move 目标值.
2. `Mut::read` 只拿走 `T`, 它自己没有释放 allocation 的能力.
3. 最外层的 `outer.inner` 仍然是 `Own`, 所以只有它可以调用 `drop_rest` 清理整条链.

wrapper 递归时也不再传裸指针. 共享借用路径会一直调用 `by_ref`:

```rust
let inner = unerased.value.inner.inner.by_ref();
let vtable = unsafe { vtable(inner.ptr) };
unsafe { (vtable.downcast_ref)(inner, target) }
```

可变借用路径则一直调用 `by_mut`:

```rust
let inner = unerased.value.inner.inner.by_mut();
let vtable = unsafe { vtable(inner.ptr) };
unsafe { (vtable.downcast_mut)(inner, target) }
```

这意味着从最外层开始的 `&self` 不会在递归到第二层后莫名其妙升级成 `&mut`, `&mut self` 的生命周期也不会在穿过 vtable 后丢失. 至于 `drop_rest`, 它从头到尾传递的都是 `Own`, 因为这条路径确实需要逐层释放 allocation.

不过这里一定不要误会: `Own`, `Ref`, `Mut` 并不是 `Box`, `&T`, `&mut T` 那种可以放心暴露给外部用户的完全安全抽象. `anyhow` 里的这三个类型都实现了 `Copy` 和 `Clone`, `boxed`, `deref`, `deref_mut` 也依然是 unsafe. 如果你复制两个 `Own` 然后分别调用一次 `boxed`, 还是会喜提 double free.

所以更准确地说, 它们是 `anyhow` 内部使用的三种"权限标签", 而不是真正负责自动管理资源的 RAII 智能指针. 它们无法把 unsafe 变没, 但是把危险操作集中到了几个很小的方法里, 同时让 vtable 的每个函数明确声明自己需要什么权限. 在维护这种大段 unsafe 代码时, 这个区别非常重要.

如果你拿 any5 和真正的 `anyhow` 一行一行对比, 还会发现两边的 vtable 并不完全一样. 真正的 `anyhow` 需要兼容不同编译器能力和 cfg, 某些路径会复用一次共享 downcast, 再在严格控制的位置转成 `Mut`; any5 为了把三种权限的区别摆得更明显, 直接拆成了 `downcast_ref` 和 `downcast_mut` 两个函数. 具体函数数量不是重点, 重点是每次跨过 vtable 边界时, 指针的所有权和生命周期都不会再被擦成一个毫无信息的 `NonNull`.

最后执行:

```shell
cargo +nightly miri test --bin any5
```

6 个测试全部通过, `MyAny`, `Own`, `Ref`, `Mut` 的大小也全都是一个 word. 到这里我们并没有增加任何运行时成本, 但是终于把 any4 里散落在人脑中的 unsafe 约定, 变成了一部分可以由 rust 编译器检查的类型信息.

## 6. 总结

一路折腾下来, 我们从最普通的 `Box<dyn Any>` 出发, 最后写出了一个栈上只有一个指针, 支持 context 链, 还能进行 owned/shared/mutable downcast 的 `MyAny`.

整个演进过程可以简单概括为:

1. `Box<dyn Any>` 负责擦除具体类型, `TypeId` 负责在 downcast 时重新确认类型, 但是 trait object 是胖指针, 栈上需要两个 word.
2. 换成裸指针后, `MyAny` 不再依赖 rust 自带的 trait object, 但是类型被擦除以后, 连应该如何 drop 都不知道了, 所以需要把 `drop_impl::<T>` 一起保存下来.
3. 把 metadata 和函数指针全部移动到堆上的 `MyAnyImpl<T>` 以后, 栈上的 `MyAny` 就只剩一个指针. 代价是我们必须依赖 `#[repr(C)]` 和稳定的公共头部, 才能通过 erased pointer 正确读取 vtable.
4. 引入 `Wrapper<C, MyAny>` 后, 错误变成了一条 context 链. 单个 `TypeId` 已经不够用了, downcast 行为必须进入 vtable, 根据每一层的真实类型递归查找.
5. owned downcast 会把链中间的某个值 move 出去, 普通的 `Drop` 不是内存泄露就是 double free, 所以又需要 `drop_rest` 递归销毁除了目标值之外的所有节点.
6. 最后用 `Own`, `Ref`, `Mut` 给裸指针重新加上所有权, 共享借用, 独占借用和生命周期信息. 它们不增加运行时成本, 但是让 vtable 的权限约定不再完全依赖人脑.

所以 `anyhow::Error` 能装"任意错误"并不是什么动态语言魔法. 真实的错误类型 `E` 从来没有凭空消失, 它只是被藏在堆上的 `ErrorImpl<E>` 里; 编译器仍然会为每一个具体的 `E` 单态化出对应的 vtable 函数. 栈上的 `Error` 只保留一个被擦除的指针, 后续所有依赖真实类型的操作, 都通过这张 vtable 找回来.

当然, 本文写的 `MyAny` 和真正的 `anyhow::Error` 还有很大差距. 真正的 `anyhow` 还需要处理:

- `Display`, `Debug`, `std::error::Error`, `Send`, `Sync` 等 trait bound.
- `source` 链, backtrace, 格式化和转成 `Box<dyn Error>` 等行为.
- 普通 `ContextError<C, E>` 和 `ContextError<C, Error>` 两条不同的构造路径.
- 不同 rust 版本, feature 和 cfg 下的兼容实现.
- 更多 pointer provenance, aliasing 和 panic safety 细节.

但是抛开这些工程细节, 最核心的骨架已经全部出现了:

```text
MyAny
  |
  v
Own<MyAnyImpl>
  |
  v
MyAnyImpl<T> = vtable + value
                         |
                         └── T 或 Wrapper<C, MyAny>
```

最后再把这套实现依赖的 unsafe invariant 集中列一下:

1. `Own<MyAnyImpl>` 必须来自一个真实的 `Box<MyAnyImpl<T>>`, 不能凭空构造.
2. allocation 里存的真实 `T` 必须和 vtable 单态化时使用的 `T` 完全一致.
3. `MyAnyImpl` 和 `Wrapper` 必须保持代码里假设的 layout, 所有 pointer cast 才能成立.
4. 只有 `TypeId` 匹配成功后, 才能把 erased pointer 还原成目标类型.
5. `ptr::read` 只能把目标值 move 一次, 随后的 `drop_rest` 必须跳过这个值, 同时把其他字段和 allocation 全部清理干净.
6. `Ref` 和 `Mut` 里的生命周期必须来自真实的 `&self` 和 `&mut self`, 不能通过 unsafe 随便延长.
7. 一个 allocation 最终只能被还原成一次 `Box` 并释放一次.

只要上面任何一条被破坏, 轻则内存泄露, 重则 use-after-free, double free 或者制造多个互相 alias 的 `&mut`. 所以 unsafe 本身并没有让 rust 的规则消失, 只是把"由编译器证明"改成了"由程序员证明".

这也是阅读 `anyhow` 源码最有意思的地方: 表面上看是一堆裸指针, vtable 和 `ManuallyDrop` 黑魔法, 但是拆开以后, 每一步其实都在补回上一步类型擦除时丢失的信息. 最终的目标也不是绕过 rust 的类型系统, 而是在保持 `anyhow::Error` 只有一个 word 的前提下, 手动搭出一套足够可靠的动态类型系统.
