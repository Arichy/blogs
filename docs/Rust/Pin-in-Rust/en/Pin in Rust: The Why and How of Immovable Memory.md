Pin is a complicated concept for Rust beginners because it's too abstract. But is's also the cornerstone of async Rust. Now I'm going to introduce Pin in following parts:

- Why Pin is needed
- What is Pin
- The essential of Pin, implement a basic MyPin

# Why Pin is needed

## The danger Self-Referential struct

In Rust, there's a particularly dangerous kind of data structure called a self-referential structure. This refers to a struct that contains a reference or pointer to another field within itself.

An object can move in memory freely, but its internal pointer will not be updated accordingly, still pointing to the old address, breaking the structure, causing undefined behavior.

For example (I'll use pointer instead of reference to avoid lifetime, for simplicity):

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

In `SelfRef`, the `ptr` will point to `v`, so it's self-referential. And the code will crash because we set the `ptr` to the address of `v` in `create_self_ref`, now everything goes well. But when the function returns `res` to `main`, `res` would move to another piece of memory. However, `ptr` did not get updated, still pointing to the old address which has been freed. So the program crashed when dereferencing `ptr`.

We may write very few self-referential structs, but in async they're ubiquitous. If you're not familiar with async, here is a basic introduction.

## The essential of async/await

async/await is a syntax sugar. It will be compiled to a state machine.

```rust
async fn self_referential() -> i32 {
    let x = String::from("hello");
    let x_ref = &x; // create a reference to x

    // put an await to get a state machine
    dummy_future().await;

    // use the reference after await, which will introduce a self-referential future
    x_ref.len() as i32
}
```

would be compiled to pseudo code:

```rust
enum SelfReferentialFuture {
    // initial state
    Start,
    // waiting dummy_future to be ready
    WaitingOnDummy {
        x: String,
        x_ref: *const String,
        dummy: DummyFuture,
    },
    // final state
    Done,
}
```

When a reference is used across an await, a self-referential future will appear, because all these variables must be stored inside the future. If the future moved during `poll`, any internal reference would become invalid, leading to undefined behavior.

So that's why we need `Pin` to prevent futures from moving, and why the `poll` function takes a `Pin<&mut impl Future>` instead of `&mut impl Future`:

```rust
fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>
```

# Pin/Unpin

First, it's important to clarify one point. **For a value with type T, if you want to move it, you must have a `&mut T`**. If you have no way to get a `&mut T`, you're not able to move it.

Then let's go through `Pin`/`Unpin`.

```rust
pub struct Pin<Ptr> {
   pub __pointer: Ptr,
}

pub auto trait Unpin {}
```

`Pin` is a struct with a **pointer type** field `Ptr`. `Pointer type` means it has `Deref` trait, such as `Box`, `Rc`, `Arc`, `&T`, `&mut T`, etc. It must store a pointer to `T` instead of direct `T`, because if `T` is store directly in `Pin`, when `Pin` moves, `T` will move together. But if `Pin` stores a pointer, it's totally fine for the pointer to move around with `Pin`.

![Bad move](https://github.com/Arichy/blogs/blob/main/docs/Rust/Pin-in-Rust/imgs/bad.png?raw=true)
![Good move](https://github.com/Arichy/blogs/blob/main/docs/Rust/Pin-in-Rust/imgs/good.png?raw=true)

`Unpin` is an auto trait. If all the fieldsof a struct implement `Unpin`, then the struct itself will implement `Unpin` automatically. Everything is `Unpin` by default, including our `SelfRef`.

`Unpin` means **the struct is not sensitive to being moved**. It does not care if it's moved at all. `Unpin` does not mean if it's movable, or not movable. In Rust, every type could move. `Unpin` means even if it's wrapped by `Pin`, user could still get `&mut T` by `Pin::get_mut` and move it. Only types with `!Unpin` is not allowed to move by the type system of Rust.

Obviously `SelfRef` is sensitive to being moved, so we need to remove `Unpin` for it manually.

In nightly Rust, we could do like this:

```rust
impl !Unpin for SelfRef{}
```

But impl !Trait is still an unstable feature. In stable Rust, we need to use a marker field:

```rust
struct SelfRef {
    v: String,
    ptr: *const String,
    _pin: PhantomPinned, // marker
}
```

`PhantomPinned` is a struct provided by `std::marker`. It has implemented `!Unpin` internally, so `SelfRef` will not implement `Unpin`.

`Pin<&mut T>` or `Pin<Box<T>>` means **either**

- `T` will not move
- `T: Unpin`

If `T: Unpin`, it does not care if it's moved, and the protection by `Pin<&mut T>` is meaningless. It's useful when we explore methods from `Pin`.

# The essential of Pin

The essential of `Pin` is rather simple. It has no any magic. Imagine if we don't have `Pin` from `std`. For `SelfRef`, we hope it could not move. How could we achieve that? The easiest way is to put it to heap, then hide it inside another struct.

```rust
// crate 1
pub struct MyPin<Ptr> {
    ptr: Ptr,
}

impl<Ptr: Deref> MyPin<Ptr> { // Ptr should be a pointer type
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

That's all. We're done. When you type `my_pinned_str.` in editor like VSCode, there is no hint. `MyPin` has no public fields or methods. `sr` is hidden in `MyPin`, and we have no way to access it, so it cannot move.

Please attention that we called `boxed.correct_ptr()`, because `Box::new(sr)` would move `sr` from stack to heap. We need to fix the pointer after the move.

The basic version has indeed achieved the prevention of movement, but it's sort of meaningless. We don't have access to `sr` at all. Is there any way to access it? Just like those smart pointers, we could implement `Deref` for it.

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

// duplicate code omitted
my_pinned_sr.say_string();
println!("{}", my_pinned_sr.v);
```

Now we could access fields of `my_pinned_str`, and methods with `&self`. We only implemented `Deref`, not `DerefMut`, so there is no way to get `&mut SelfRef`, and it could not move. If another function needs a `sr`, we could pass `my_pinned_sr` to it just like `handle(my_pinned_sr)`. `handle` cannot move
`sr`.

But what if we need mutable reference? What if we need to call `push_str` on `sr.v`? It's totally okay because it's not move `v`.

If we implement `DerefMut` to allow user to get a mutable reference directly:

```rust
impl<Ptr: DerefMut> DerefMut for MyPin<Ptr> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ptr.deref_mut()
    }
}
```

User could get `&mut SelfRef` and move it. We lose the protection from `MyPinned`. User could do like this:

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
std::mem::swap(&mut *pinned_a, &mut *pinned_b); // dangerous! move by swap
print("a", &pinned_a);
print("b", &pinned_b);
```

It will output:

```rust
addr of a.v: 0x60000165d1e0, value of a.ptr 0x60000165d1e0, value of a.v: hello , deref value of a.ptr: hello
addr of b.v: 0x60000165d200, value of b.ptr 0x60000165d200, value of b.v: world , deref value of b.ptr: world
addr of a.v: 0x60000165d1e0, value of a.ptr 0x60000165d200, value of a.v: world , deref value of a.ptr: hello
addr of b.v: 0x60000165d200, value of b.ptr 0x60000165d1e0, value of b.v: hello , deref value of b.ptr: world
```

`a.ptr` and `b.ptr` both point to the wrong address.

That's the problem. We need a way to get `&mut SelfRef` and we need to prevent user from moving `SelfRef` by it. Currently, Rust compiler is not able to tell if an operation is moving `T`. So the official `Pin` chose a little bit extreme way: `unsafe fn`.

- For `T: Unpin`, provide `&mut` by `DerefMut`
- For `T: !Unpin`, provide `&mut T` by `unsafe fn`

```rust
// Only impl DerefMut for whose Target is Unpin
impl<Ptr: DerefMut<Target: Unpin>> DerefMut for MyPin<Ptr> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.ptr.deref_mut()
    }
}

impl<Ptr: DerefMut> MyPin<Ptr> {
    // as_mut is for resolving lifetime issue. Ptr has no lifetime while &mut T has
    // A bridge in MyPin<Ptr> -> MyPin<&'a mut T> -> &'a mut T
    pub fn as_mut(&mut self) -> MyPin<&mut Ptr::Target> {
        MyPin {
            ptr: &mut *self.ptr,
        }
    }
}

impl<'a, T> MyPin<&'a mut T> {
    // For T: Unpin, return &mut T directly
    pub fn get_mut(self) -> &'a mut T
    where
        T: Unpin,
    {
        self.ptr
    }

    // For T: !Unpin, return &mut T in unsafe fn to warn
    unsafe fn get_unchecked_mut(self) -> &'a mut T {
        self.ptr
    }
}
```

Now the previous `swap` will cause an error:

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

The `Ptr` of `MyPin<Box<SelfRef>>` is `Box<SelfRef>`, whose `Target` is `SelfRef`, and `SelfRef: !Unpin`, so `MyPin<Box<SelfRef>>` does not implement `DerefMut`. We could not construct `&mut *pinned_a` and `&mut *pinned_b`.

If we still wants to `swap`, we need to write `unsafe block`:

```rust
unsafe {
    let a_mut = pinned_a.as_mut().get_unchecked_mut();
    let b_mut = pinned_b.as_mut().get_unchecked_mut();
    std::mem::swap(a_mut, b_mut);
}
```

And that's a contract between programmer and compiler: I need a `&mut T`, but compiler cannot prevent me from moving `T` when I possess `&mut T`. So I, as programmer, promise that I would never move `T`. That's the purpose of `unsafe block`: you're able do something dangerous in unsafe block, but you promise you would never do it.

# Summary

1. In Rust, self-referential structs are very dangerous because of moving.
2. In the state machine of async/await, self-referential structs are ubiquitous, because all variables must be stored in the struct.
3. If you want to move `T`, you must have a `&mut T`. Some operations on `&mut T` will move it, while others will not.
4. `Pin` is very simple. It's just a wrapper of a pointer to `T`, and provide different access according to `Unpin` or `!Unpin`. If `T: Unpin`, then it provides full access. User could get `&T` and `&mut T` freely. Otherwise, user could only get `&T`. To get a `&mut T`, user must write `unsafe block` and promise that `T` would never move in it.
