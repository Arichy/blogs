# How `anyhow` Works

## Preface

As one of the most popular crates in the Rust ecosystem, `anyhow` also happens to be relatively approachable source code. This article gives a simplified introduction to its core design: how a relentlessly strict, statically typed language like Rust manages to represent "any error type." If you come from C or C++, none of this may be particularly novel; chances are you have already seen this pattern somewhere. But if, unfortunately, you are like me and had never encountered it before, the black magic underneath is well worth digging into.

Our goal is to build a small `MyAny` struct that can store an arbitrary type like `anyhow` does, then recover the concrete type through downcasting. We will begin with the simplest possible `Box<dyn Trait>` and gradually make it look more and more like the real `anyhow`.

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

## 1. The `Box<dyn Any>` Version

When we want to build a container that can hold any type `T`, the first instinct is to reach for a trait object. Notice that a generic type will not work here: `MyAny<T>` and `MyAny<U>` are two different types, while `anyhow::Error` itself has no generic parameter. We also need to record the `type_id` of `T`, obtained from `TypeId::of::<T>()`, so that downcasting can verify the requested type.

The first version is easy to write:

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

The core idea is actually very simple:

1. Put the value in a `Box`, erase its concrete type behind a trait object, and normalize everything into `Box<dyn Any + 'static>`. We define our own `trait Any` because we need some trait to form a `dyn Trait`.
2. Record the real type in `type_id`, a unique ID assigned to every type by the Rust compiler.
3. In `downcast::<T>()`, compare the recorded ID with `TypeId::of::<T>()`. If they match, use a series of unsafe casts to force the pointer back into `T`; otherwise, take the unhappy path.

### Drawback

A trait object is a fat pointer containing two words: one address and one vtable pointer. On a typical 64-bit platform, `Box<dyn Trait>` therefore occupies 16 bytes on the stack instead of the usual 8-byte pointer, immediately doubling its size.

In a large project built around `anyhow`, a huge number of functions return `Result<T, anyhow::Error>`. When a function returns `Err(anyhow::Error)`, that value moves up through the call stack one frame at a time. `anyhow` wants this frequently moved value to be as small as possible. Its solution is to keep only a raw pointer on the stack, pointing to a heap-allocated `ErrorImpl` that contains the vtable. This keeps `size_of::<anyhow::Error>() == 8`, so every function return or async state-machine suspension needs to store only 8 bytes instead of 16.

## 2. The Raw Pointer Version

Let us ignore the final size for a moment and first replace `Box` with a raw pointer.

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

The program behaves exactly as expected and prints `result is i32: 3`. Next, let us exercise the `Err` branch by deliberately requesting the wrong type:

```rust
match result.downcast::<i64>() {
    Ok(sum) => println!("result is i32: {}", sum), // sum: i32
    Err(result) => println!("result is not i32"),  // result: MyAny
}
```

This also prints the expected `result is not i32`. Everything appears fine, but there is actually a major bug hiding underneath: a memory leak. To find it, we can bring in [Miri](https://github.com/rust-lang/miri), Rust's official Undefined Behavior checker.

```shell
rustup toolchain install nightly # Install nightly first if you do not have it; Miri requires nightly

rustup +nightly component add miri # Install Miri

cargo +nightly miri run # Run Miri
```

To our surprise, Miri reports an error:

```text
result is not i32
error: memory leaked: alloc284 (Rust heap, size: 4, align: 4), allocated here:
  --> src/bin/any.rs:10:21
   |
10 |         let boxed = Box::new(value);
   |                     ^^^^^^^^^^^^^^^
   |
   = note: stack backtrace:
```

The report says that the heap allocation created by `Box::new(3)`—four bytes in size and alignment, in other words the `i32`—was leaked.

This is not too hard to explain. `MyAny::new(3)` first allocates the value with `let boxed = Box::new(3)`, then turns the `Box` into a raw pointer with `Box::into_raw` and stores that pointer in `MyAny`. Ownership of `boxed` has been transferred into the raw pointer, so leaving the function does not generate any drop glue for the `Box`.

At this point, `result: MyAny` contains a raw pointer to a heap-allocated `i32`. When the `Err` branch ends, Rust runs the drop glue for `MyAny`. But `MyAny` has no `Drop` implementation, so Rust merely clears the stack fields `ptr` and `type_id`; it has no idea that `ptr` owns a heap allocation. The pointed-to memory survives all the way to the end of `main`, and we have a leak.

The fix seems obvious: implement `Drop` for `MyAny`.

```rust
impl Drop for MyAny {
    fn drop(&mut self) {
        // ???
    }
}
```

But what should `drop` actually do? `Drop::drop` cannot be generic, so we cannot restore the original `T` the way `downcast` does and let `Box::from_raw` destroy it. And we absolutely cannot do this:

```rust
impl Drop for MyAny {
    fn drop(&mut self) {
        let boxed = unsafe { Box::from_raw(self.ptr) };
        drop(boxed);
    }
}
```

The inferred type of `boxed` is `Box<()>`, so dropping it uses the layout of `()`. In concrete terms, it does essentially nothing, because `()` is a ZST—a zero-sized type.

This is where a vtable enters the picture. `drop` itself cannot be generic, but nothing stops us from storing a monomorphized generic function inside `MyAny`.

```rust
struct MyAny {
    ptr: *mut (),
    type_id: TypeId,
    drop: fn(*mut ()), // This field itself is not generic
}

fn drop_impl<T>(ptr: *mut ()) { // The argument must be *mut (), matching self.ptr
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
            drop: drop_impl::<T>, // Monomorphize and store the concrete drop_impl function pointer
        }
    }
}
```

Run Miri again, and this time it stays quiet.

Now switch back to the `Ok` branch:

```rust
match result.downcast::<i32>() { // Request the correct type again
    Ok(sum) => println!("result is i32: {:?}", sum), // sum: i32
    Err(result) => println!("result is not i32"),    // result: MyAny
}
```

Miri mercilessly complains again:

```text
error: Undefined Behavior: constructing invalid value of type std::boxed::Box<i32>: encountered a dangling box (use-after-free)
```

The problem is in `downcast`. To make the sequence easier to discuss, expand `Ok(*boxed)` into a local variable:

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

That single `let result = *boxed` performs several operations:

1. It moves the `i32` pointed to by `boxed` onto the stack and stores it in `result`.
2. It marks the value inside `boxed` as moved.
3. `Box` receives special treatment from the compiler. Moving through a dereference does not call `T::drop`, but it still deallocates the box's heap allocation. Otherwise that allocation would leak.

So far nothing is wrong. The first free happens, and `Ok(result)` returns normally. But `self` was passed by value, which means `downcast` owns it. At the end of the function, `self` is destroyed and runs the `Drop` implementation we just added, freeing the same allocation a second time.

We cannot suppress the first free—that is part of the compiler's special handling for `Box`. The only option is to prevent the second free by stopping `self` from being dropped inside `downcast`:

```rust
fn downcast<T: 'static>(self) -> Result<T, Self> {
    if self.type_id == TypeId::of::<T>() {
        let this = ManuallyDrop::new(self); // Prevent self from running Drop
        let raw_ptr = this.ptr.cast::<T>();
        let boxed = unsafe { Box::from_raw(raw_ptr) };

        Ok(*boxed)
    } else {
        Err(self)
    }
}
```

That fixes the issue, and Miri is happy again.

## 3. Size-Optimized Version: `MyAnyImpl`

In version 2, `MyAny` occupies 32 bytes: `ptr` is 8, `type_id` is 16, and `drop` is another 8. As discussed earlier, `anyhow::Error` moves around constantly, so we want this value to be as small as possible.

The most direct solution is to keep only one pointer on the stack, move every other field into a heap allocation, and point at that allocation. While we are at it, we will replace the raw pointer with `NonNull`.

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

There are two extremely important details here:

- `#[repr(C)]`
- The field order of `MyAnyImpl`: `value: T` must come last

During downcasting, we need to read the stored `type_id` and compare it against `T`. But `self.inner` has the erased type `MyAnyImpl<()>`. Accessing fields through that pointer uses the layout of `MyAnyImpl<()>`, which effectively contains only the stable `drop` and `type_id` prefix.

Those stable fields therefore need to come first, with the type-dependent `value: T` at the end, so that their offsets remain correct.

Here is the result from a local experiment. Suppose we wrote `MyAnyImpl` like this:

```rust
struct MyAnyImpl<T = ()> {
    value: T,
    drop: fn(NonNull<MyAnyImpl>),
    type_id: TypeId,
}
```

The layout of `MyAnyImpl<()>` happened to be:

1. offset 0: drop
2. offset 8: type_id
3. offset 24: value

For `MyAnyImpl<i32>`, the layout happened to be:

1. offset 0: drop
2. offset 8: type_id
3. offset 24: value

That happens to match `MyAnyImpl<()>`, so nothing goes wrong.

But for `MyAnyImpl<Vec<i32>>`, the layout became:

1. offset 0: value
2. offset 24: drop
3. offset 32: type_id

Now everything blows up. `self.inner.as_ref().type_id` reads `type_id` according to the `MyAnyImpl<()>` layout, at offset 8. But in the real `MyAnyImpl<Vec<i32>>`, offset 8 belongs to one of the fields inside `Vec<i32>`.

That is why we need both `#[repr(C)]` and `value: T` as the final field: together they prevent Rust from reordering the fields and keep the common prefix stable.

## 4. The `context` (`Wrapper`) Version

The real `anyhow::Error` supports `context`, meaning that you can attach some additional context to an error. When you write

```rust
let content = std::fs::read(path)
        .with_context(|| format!("Failed to read instrs from {}", path))?;
```

the error type of `content` is still `anyhow::Error`, except that the `ErrorImpl` inside it now wraps a `ContextError<C, E>`. The definition of `ContextError<C, E>` is very simple:

```rust
#[repr(C)]
pub(crate) struct ContextError<C, E> {
    pub context: C,
    pub error: E,
}
```

It merely puts your real error type `E` and the supplied `context` together, then treats the whole thing as one `Error`. In this situation, **we need to support downcasting to both `C` and `E`**.

There is one more detail worth mentioning. When context is first attached to an ordinary `Result<T, E>`, `anyhow` can put `ContextError<C, E>` directly into the same allocation. But if the wrapped error is already an `anyhow::Error`, then `E` becomes `anyhow::Error`, giving us `ContextError<C, anyhow::Error>`. Every additional context adds another node to the chain. We will ignore the first optimization for now. The `MyAny::wrap` below always receives a `MyAny`, specifically modeling the second, chained representation.

Let us try to simulate it by allowing the real value inside `MyAnyImpl` to carry a `context`.

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
    // Downcast to the context type
    match wrapped.downcast_ref::<String>() {
        Some(ctx) => {
            println!("context is : {ctx}");
        }
        None => panic!(),
    }

    // Downcast to the value type
    match wrapped.downcast_ref::<i32>() {
        Some(value) => {
            println!("value is : {value}");
        }
        None => panic!(),
    }
}
```

Now try to update the implementation of `MyAny::downcast`, and a huge problem immediately appears. There is only one `type_id` stored in `self`: the type pointed to by its own `inner` pointer. But `C` lives inside that type. With the current `downcast` implementation, a wrapped value cannot support either `downcast::<C>` or `downcast::<T>`, because both `C` and `T` are hidden one level deeper. The only type information available at this level is `Wrapper<C, MyAny>`.

At this point, `wrapped` has essentially become a linked list. The current node contains the context `owned-context`; the next node is a leaf with no context and a value of `123`. Downcasting therefore needs to recurse through the chain.

You might think that we could simply add a `context_type_id: Option<TypeId>` to `MyAnyImpl`. Yes, that would solve `downcast::<C>`, but it still would not solve `downcast::<T>`, because `T` remains hidden in the next node. To peel back the next layer, we would first need to compare the current `type_id` against `TypeId::of::<Wrapper<C, T>>()`; but at this point we do not know `C`, so we cannot even write that type.

The fundamental problem is that `type_id` describes **the type stored at the current node**, but it cannot describe **how the type stored at the current node should perform a downcast**. That behavior is exactly what a vtable is for. We therefore need to add a function named `downcast` to `MyAnyImpl`. Placing it directly in the struct, however, creates another problem: every additional function pointer makes `MyAnyImpl` eight bytes larger. The usual solution is to extract a single `vtable: &'static VTABLE` field and put all function pointers inside it. The field itself still occupies only one pointer, and all N instances of the same concrete `MyAnyImpl<T>` share one vtable.

Since downcasting has now been delegated to `vtable.downcast`, we can remove `type_id` as well. The concrete type is available when the vtable is created, so `vtable.downcast` can be monomorphized for that type.

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

The leaf implementation of `downcast` is now different from the wrapped implementation. A wrapper first tries to downcast to `C`; if that does not match, it calls `vtable.downcast` on the `MyAnyImpl` stored inside itself and continues recursively.

But Miri mercilessly reports a memory leak for this code. In the final `wrapped.downcast::<String>()`, we move the `context: String` out. That string is dropped when it leaves scope, but `ManuallyDrop` prevents `self`—the entire outer `MyAny`—from being dropped. The heap-allocated inner pointer, along with the complete leaf `MyAny` it points to, is still left behind. Removing `ManuallyDrop` is no good either: the context would then be freed twice, first when `self` leaves scope and again when `ctx` leaves scope.

The vtable therefore needs one more function: `drop_rest`.

```rust
struct VTABLE {
    drop: fn(NonNull<MyAnyImpl>),
    downcast: fn(NonNull<MyAnyImpl>, target: TypeId) -> Option<NonNull<()>>,
    drop_rest: fn(NonNull<MyAnyImpl>, target: TypeId),
}
```

Why call it `drop_rest`? When `downcast::<T>()` succeeds, `ptr::read` has already moved one `T` out of the chain. Ownership of that `T` now belongs to the caller, so it must not be dropped a second time. The contexts, wrappers, and heap allocations other than `T`, however, still need to be cleaned up normally. In other words, `drop_rest` must **leave behind the `T` that has already been taken and drop everything else**.

Start with the simplest case, a leaf node. Its `value` is `T` itself. Since `T` has already been moved out, we can replace it with `ManuallyDrop<T>` and then destroy the complete `Box`:

```rust
fn drop_rest_impl<T: 'static>(ptr: NonNull<MyAnyImpl>, _target: TypeId) {
    let boxed = unsafe { Box::from_raw(ptr.as_ptr().cast::<MyAnyImpl<ManuallyDrop<T>>>()) };
    drop(boxed);
}
```

`ManuallyDrop<T>` has exactly the same layout as `T`; the only difference is that it does not run `T::drop`. Thus `drop(boxed)` still releases the heap allocation occupied by `MyAnyImpl`, but does not drop the `T` already taken by `ptr::read`. A leaf does not need the `target` argument, but keeping it gives every `drop_rest` the same function signature.

Next, put it into the leaf vtable:

```rust
let vtable = &VTABLE {
    drop: drop_impl::<T>,
    downcast: downcast_impl::<T>,
    drop_rest: drop_rest_impl::<T>,
};
```

`MyAny::downcast` must also call `drop_rest` after taking the value:

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

Let us walk through what the `Some(result)` branch is doing:

1. `vtable.downcast` finds the address of `T` somewhere in the chain.
2. `ManuallyDrop::new(self)` prevents the outermost `MyAny` from automatically running `Drop`.
3. `ptr::read` copies `T` out of its original location bit for bit, transferring ownership to the local variable `value`.
4. Starting at the outermost node, `drop_rest` destroys everything except `T`, one layer at a time.

A leaf node is simple, but a wrapper node is more troublesome. Let us begin with an implementation that appears reasonable:

```rust
pub fn drop_rest_impl<C: 'static>(
    ptr: NonNull<MyAnyImpl>,
    target: TypeId,
) {
    if TypeId::of::<C>() == target {
        // We downcast to this node's context, so skip C and drop inner normally.
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>>(),
            )
        };
        drop(boxed);
    } else {
        // We downcast to a value inside inner, so drop C and skip inner.
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

If the value being taken is the current node's `context: C`, we cast the real type

```rust
MyAnyImpl<Wrapper<C, MyAny>>
```

to

```rust
MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>
```

This makes drop skip the `C` that has already been moved out, while destroying the following `MyAny` normally. The complete inner chain is therefore dropped as well.

If the value being taken lives somewhere inside `inner`, we instead cast it to

```rust
MyAnyImpl<Wrapper<C, ManuallyDrop<MyAny>>>
```

The current `C` is now dropped normally, while `inner` does not run `MyAny::drop`, preventing it from destroying the target that was just moved out. This looks perfectly reasonable, so let us try the current test:

```rust
let origin = MyAny::new(42);
let w1 = MyAny::wrap("c1".to_string(), origin);
let w2 = MyAny::wrap("c2".to_string(), w1);

match w2.downcast::<String>() {
    Ok(ctx) => println!("context is: {ctx}"),
    Err(_) => panic!(),
}
```

It prints `context is: c2`, and Miri reports nothing. Are we done already? Unfortunately, this test is lying to us. Both `w1` and `w2` use `String` as their context type, so `downcast::<String>` matches the outermost `c2` and never enters the `else` branch. Change the target type to the innermost `i32`:

```rust
match w2.downcast::<i32>() {
    Ok(value) => println!("value is: {value}"),
    Err(_) => panic!(),
}
```

The value itself still prints correctly:

```text
value is: 42
```

But Miri immediately reports several memory leaks, including both the wrappers allocated by `MyAny::wrap` and the leaf allocated by `MyAny::new`.

The problem lies in that seemingly reasonable `else` branch. `ManuallyDrop<MyAny>` does stop `inner` from running `MyAny::drop`, and both the current context and the current allocation really are freed. But `inner` itself still holds a raw pointer to the next allocation. Once `inner` disappears with the outer allocation, that pointer—and therefore the entire chain it points to—is lost forever.

Simply "skipping inner" is therefore not enough. Before dropping the current node, we need to save the pointer to the next node. Once the current node has been cleaned up, we call `drop_rest` from the next node's vtable and continue recursively:

```rust
pub fn drop_rest_impl<C: 'static>(
    ptr: NonNull<MyAnyImpl>,
    target: TypeId,
) {
    if TypeId::of::<C>() == target {
        // This node's context has already been moved out.
        // Skip C and drop inner normally.
        let boxed = unsafe {
            Box::from_raw(
                ptr.as_ptr()
                    .cast::<MyAnyImpl<Wrapper<ManuallyDrop<C>, MyAny>>>(),
            )
        };
        drop(boxed);
    } else {
        // The target lives inside inner. Drop C normally,
        // skip inner for now, then clean up the next node recursively.
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

In `let inner = boxed.value.inner.inner`, the first `inner` is `Wrapper::inner`, and the second is `MyAny::inner`. The final result is the next node's `NonNull<MyAnyImpl>`. Since `NonNull` itself is `Copy`, we can save it on the stack before freeing `boxed`.

Once again, this code is making dangerous assumptions about layout. The casts above are valid only under two conditions:

1. Both `MyAnyImpl` and `Wrapper` must be `#[repr(C)]`.
2. `ManuallyDrop<T>` and `T` must have the same layout.

Only then can we replace either `C` or `MyAny` with `ManuallyDrop` without changing the offsets of the other fields or the layout of the complete allocation. Remove `#[repr(C)]` from `Wrapper`, and we are right back to the field-reordering problem from the previous section.

Finally, remember to put the corresponding `drop_rest` into the wrapper's vtable:

```rust
let vtable = &VTABLE {
    drop: drop_impl::<Wrapper<C, MyAny>>,
    downcast: crate::wrapper::downcast_impl::<C>,
    drop_rest: crate::wrapper::drop_rest_impl::<C>,
};
```

`downcast_ref` and `downcast_mut` do not need any of this machinery. They only borrow a value instead of moving it out of the chain, so the complete `MyAny` can still follow its ordinary `Drop` path at the end. Both methods simply reuse `vtable.downcast` to find the address, while `&mut self` guarantees the exclusivity needed by `downcast_mut`.

Now test it again with two different context types:

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

The final output is `value is: 43`. This owned downcast targets the deepest `i32`, so it necessarily passes through both recursive wrapper operations: `downcast` and `drop_rest`. To be extra sure, I also tested taking the outer context, the middle context, the leaf value, and a failed downcast. Every layer was given a drop counter to verify that every value other than the one moved out is dropped exactly once.

Finally, run:

```shell
cargo +nightly miri test --bin any4
```

All five tests pass, with neither leaks nor double frees. At this point, `MyAny` truly supports context. Its stack size is still only one pointer, but it can downcast to any layer of the wrapper chain and correctly clean up every remaining node after an owned downcast.

## 5. The Smart Pointer Version: `Own`, `Ref`, and `Mut`

The previous version basically works. But if you open the `anyhow` source, you will notice that it does not pass `NonNull` around everywhere. Instead, it defines three pointer wrappers of its own: [Own<T>](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L6-L11), [Ref](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L64-L70), and [Mut](https://github.com/dtolnay/anyhow/blob/5bdb0e24db3994be119d42f18fe2d655e1f68f4a/src/ptr.rs#L125-L131).

At first glance, this may look rather baffling. Do all three structs not contain exactly the same `NonNull<T>`? We just went through the trouble of replacing `Box` with a raw pointer, and now we are adding three new shells around it. What is the point?

Look back at the vtable from any4:

```rust
struct VTABLE {
    drop: fn(NonNull<MyAnyImpl>),
    downcast: fn(NonNull<MyAnyImpl>, TypeId) -> Option<NonNull<()>>,
    drop_rest: fn(NonNull<MyAnyImpl>, TypeId),
}
```

Every function here receives a `NonNull<MyAnyImpl>`, and `downcast` returns an equally uninformative `NonNull<()>`. Yet these apparently identical raw pointers actually serve three completely different roles:

1. The pointers passed to `drop` and `drop_rest` own the complete allocation and may free it through `Box::from_raw`.
2. The pointer used by `downcast_ref` is only temporarily borrowed from `&self`. It is read-only and must never outlive `self`.
3. The pointer used by `downcast_mut` is borrowed from `&mut self`. It may mutate the value, but no other reference may exist at the same time.

Here is the problem: earlier we intended to erase only the concrete `T`, but accidentally erased the pointer's ownership, borrowing mode, and lifetime as well. To the Rust compiler, all three pointers above are just `NonNull`; there is no difference whatsoever.

For example, this ridiculous sequence is perfectly valid at the type level:

```rust
let ptr = self.inner; // NonNull<MyAnyImpl>
(vtable.drop)(ptr);   // It may be freed
(vtable.downcast)(ptr, target); // And then accessed again
```

Actually running it will probably give us a use-after-free. The compiler cannot help, because `NonNull` expresses neither that the allocation has already been freed nor whether the pointer originated from `&self`, `&mut self`, or an owning `Box`.

`NonNull::as_ref` and `NonNull::as_mut` have a similar problem. The lifetime of the reference they return is not automatically derived from some original reference; it is up to the caller of the unsafe operation to guarantee. The signature of any4's outermost `downcast_ref(&self) -> Option<&T>` happens to constrain the result to the lifetime of `&self`. But once we enter the vtable and recurse through several wrappers, all that remains between the layers is a pile of raw pointers. A human has to remember where every pointer originally came from.

So `Own`, `Ref`, and `Mut` do not solve a runtime problem. They **put the permission information erased by the raw pointer back into the type system**.

Start with `Own`:

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

`Own<T>` means that the allocation behind this pointer belongs to the current `MyAny`. Only `Own<T>` provides `boxed`, so code needs an `Own<T>` before it can call `Box::from_raw` and reclaim the allocation. At the same time, `by_ref` and `by_mut` can temporarily lend out a `Ref` or `Mut`, following the same direction as borrowing `&T` or `&mut T` from an ordinary value:

```text
                 ┌── by_ref() ──> Ref<'a, T>
Own<T> ──────────┤
                 └── by_mut() ──> Mut<'a, T>
```

The reverse direction does not exist. Neither `Ref` nor `Mut` has a `boxed` method, so a downcast function whose only job is to find a target value cannot casually free the complete allocation along the way.

Next comes `Ref`:

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

Alongside its raw pointer, `Ref<'a, T>` carries a `PhantomData<&'a T>`. `PhantomData` occupies no memory, but tells the compiler: "Treat me as though I really hold an `&'a T`, and apply the normal lifetime and shared-borrow checks."

As a `Ref<'a, MyAnyImpl>` recurses through the wrappers, `'a` travels with it. The final `Ref<'a, ()>` returned after finding the target still cannot outlive the outermost `&self`. No matter how many vtable layers it crosses, the lifetime no longer vanishes into thin air.

`Mut` is almost identical, except that its `PhantomData` contains `&'a mut T`:

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

`Mut<'a, T>` means that the pointer came from an exclusive borrow. It can be turned back into an `&'a mut T` in `downcast_mut`, or use `ptr::read` to move `T` out during an owned downcast. It still cannot reclaim the allocation; that final job remains exclusive to `Own`.

All three structs use `#[repr(transparent)]`, and `PhantomData` is a ZST, so their size on a 64-bit machine is still exactly eight bytes:

```rust
assert_eq!(size_of::<Own<MyAnyImpl>>(), 8);
assert_eq!(size_of::<Ref<'static, MyAnyImpl>>(), 8);
assert_eq!(size_of::<Mut<'static, MyAnyImpl>>(), 8);
```

In other words, these three shells add absolutely nothing at runtime. The value inside is still the same raw pointer. Everything they add exists only at compile time: function signatures can finally say which kind of pointer they require.

The vtable in any5 therefore becomes:

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

While we are here, every function pointer has also become an `unsafe fn`. `Own`, `Ref`, and `Mut` can express what permissions a pointer carries, but they do not know whether the erased concrete type really is the type claimed by the vtable. Whether the allocation received by `drop_impl::<String>` truly contains a `MyAnyImpl<String>` is still an invariant established when the vtable is created, so these functions remain unsafe.

The rules are almost written directly on the signatures now:

1. `drop` and `drop_rest` destroy the allocation, so they must receive `Own<MyAnyImpl>`.
2. `downcast_ref` accepts only a `Ref<'a, MyAnyImpl>` and may return only a `Ref<'a, ()>` with the same lifetime `'a`.
3. `downcast_mut` accepts only a `Mut<'a, MyAnyImpl>`, and its result must remain a `Mut<'a, ()>` within the same exclusive borrow.

The `for<'a>` here means that the function must work for **any** lifetime `'a`. Whatever lifetime comes in is exactly the lifetime that comes back out; the function cannot secretly return `'static`.

The real `anyhow` source does not explicitly write `for<'a>`, though. Its original definition is:

```rust
object_downcast: unsafe fn(Ref<ErrorImpl>, TypeId) -> Option<Ref<()>>,
```

This is simply Rust's lifetime elision at work. The omitted lifetime inside the input `Ref<ErrorImpl>` becomes a generic lifetime `'a`. Since it is the only input lifetime, the omitted lifetime in the output `Ref<()>` is tied to that same `'a`. Fully expanded, the type is the spelling used explicitly in any5:

```rust
for<'a> unsafe fn(
    Ref<'a, MyAnyImpl>,
    TypeId,
) -> Option<Ref<'a, ()>>
```

Any5 deliberately does not elide it. The point is to put "the output lifetime is the input lifetime" directly in front of us, not to claim that the literal characters `for<'a>` appear in the `anyhow` source.

Now, if we accidentally pass a `Ref` to `drop`, the code does not even compile:

```rust
let borrowed = self.inner.by_ref();
(vtable.drop)(borrowed);
// expected Own<MyAnyImpl>, found Ref<'_, MyAnyImpl>
```

That is the main value of these three pointers. Unsafe has not disappeared, and an incorrect pointer cast can still make everything blow up. Previously, however, every function accepted `NonNull`, so all the rules had to live in a human's head. Now at least "who may free, who may only read, who may write, and how long the reference may live" are present in the type signatures. Many obvious permission mistakes become compile errors.

The pointer stored by `MyAny` also changes from `NonNull` to `Own`:

```rust
struct MyAny {
    inner: Own<MyAnyImpl>,
}
```

When constructing a `MyAny`, `Own::new` first takes ownership of the `Box`, and only then do we erase the concrete `T`:

```rust
let my_any_impl = MyAnyImpl { vtable, value };
let inner = Own::new(Box::new(my_any_impl)).cast::<MyAnyImpl>();

Self { inner }
```

Every later operation needs to read `vtable`, the first field of `MyAnyImpl`. To avoid repeating the same cast everywhere, we extract one helper:

```rust
unsafe fn vtable(ptr: NonNull<MyAnyImpl>) -> &'static VTABLE {
    unsafe { *(ptr.as_ptr() as *const &'static VTABLE) }
}
```

This function relies on `MyAnyImpl` being `#[repr(C)]` and on `vtable` always being the first field. It is the same common-prefix trick used in the previous section to read fields through an erased pointer.

An ordinary `Drop` may only hand its `Own` to the vtable:

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

`downcast_ref` and `downcast_mut`, on the other hand, must first borrow the correct pointer type from `Own`:

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

These methods now make the two distinct paths very easy to see:

```text
&self     -> Ref<MyAnyImpl> -> Ref<()> -> &T
&mut self -> Mut<MyAnyImpl> -> Mut<()> -> &mut T
```

An owned downcast is slightly different. It ultimately moves `T` out, so it first locates the target through `Mut` and performs a `read`, then hands the outermost `Own` to `drop_rest`:

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

The permission changes are equally clear:

1. `self.inner.by_mut()` temporarily lends out a `Mut` to find and move the target recursively.
2. `Mut::read` takes only `T`; `Mut` itself has no ability to free the allocation.
3. The outermost `outer.inner` is still an `Own`, so only it can call `drop_rest` and clean up the entire chain.

Wrapper recursion no longer passes raw pointers either. The shared-borrow path keeps calling `by_ref`:

```rust
let inner = unerased.value.inner.inner.by_ref();
let vtable = unsafe { vtable(inner.ptr) };
unsafe { (vtable.downcast_ref)(inner, target) }
```

The mutable-borrow path keeps calling `by_mut`:

```rust
let inner = unerased.value.inner.inner.by_mut();
let vtable = unsafe { vtable(inner.ptr) };
unsafe { (vtable.downcast_mut)(inner, target) }
```

This means an `&self` at the outermost layer cannot somehow turn into an `&mut` after recursing into the second layer, and the lifetime of `&mut self` does not disappear after crossing a vtable boundary. `drop_rest`, meanwhile, carries `Own` from beginning to end because that path genuinely does need to free each allocation in turn.

There is one important caveat: `Own`, `Ref`, and `Mut` are not completely safe abstractions like `Box`, `&T`, and `&mut T` that should be casually exposed to users. All three types in `anyhow` implement `Copy` and `Clone`, while `boxed`, `deref`, and `deref_mut` remain unsafe. Copy two `Own` values and call `boxed` on each, and you will still be rewarded with a double free.

More precisely, they are three internal "permission labels" used by `anyhow`, not RAII smart pointers that automatically manage resources. They cannot make unsafe disappear. What they do is concentrate dangerous operations in a few small methods and force every vtable function to state which permission it requires. That distinction matters enormously when maintaining a large block of unsafe code.

If you compare any5 with the real `anyhow` line by line, you will also notice that the two vtables are not identical. The real `anyhow` needs to support different compiler capabilities and cfg combinations. Some paths reuse a shared downcast and convert it to `Mut` at one tightly controlled point. Any5 splits the operation directly into `downcast_ref` and `downcast_mut` so that the three permissions are easier to see. The exact number of functions is not important. What matters is that ownership and lifetime information are no longer erased into a meaningless `NonNull` every time a pointer crosses the vtable boundary.

Finally, run:

```shell
cargo +nightly miri test --bin any5
```

All six tests pass, and `MyAny`, `Own`, `Ref`, and `Mut` are each exactly one word in size. We have added no runtime cost, but the unsafe conventions that were scattered through a human's head in any4 have finally become type information that the Rust compiler can check.

## 6. Summary

After all that work, we have gone from an ordinary `Box<dyn Any>` to a `MyAny` that occupies only one pointer on the stack, supports a chain of contexts, and provides owned, shared, and mutable downcasts.

The complete evolution can be summarized as follows:

1. `Box<dyn Any>` erases the concrete type, while `TypeId` confirms it again during downcasting. But a trait object is a fat pointer and therefore occupies two words on the stack.
2. Replacing it with a raw pointer removes the dependency on Rust's built-in trait objects. Once the type is erased, however, even the correct way to drop the value is unknown, so `drop_impl::<T>` needs to be stored alongside it.
3. Moving all metadata and function pointers into a heap-allocated `MyAnyImpl<T>` leaves only one pointer in the stack-side `MyAny`. The cost is that we must rely on `#[repr(C)]` and a stable common prefix to read the vtable correctly through an erased pointer.
4. Introducing `Wrapper<C, MyAny>` turns an error into a chain of contexts. A single `TypeId` is no longer enough: downcast behavior has to move into the vtable and recursively search according to the real type at each layer.
5. An owned downcast moves one value out of the middle of the chain. An ordinary `Drop` would either leak memory or double-free the target, so `drop_rest` must recursively destroy every node except the value being returned.
6. Finally, `Own`, `Ref`, and `Mut` put ownership, shared-borrow, exclusive-borrow, and lifetime information back onto the raw pointer. They add no runtime cost, but stop the vtable's permission rules from living entirely in a human's head.

There is no dynamic-language magic behind the ability of `anyhow::Error` to hold "any error." The real error type `E` never vanishes. It is merely hidden inside a heap-allocated `ErrorImpl<E>`, and the compiler still monomorphizes the corresponding vtable functions for every concrete `E`. The stack-side `Error` keeps only one erased pointer; every operation that depends on the real type recovers that information through the vtable.

Of course, the `MyAny` in this article is still a long way from the real `anyhow::Error`. The actual crate also needs to handle:

- Trait bounds such as `Display`, `Debug`, `std::error::Error`, `Send`, and `Sync`.
- The `source` chain, backtraces, formatting, conversion to `Box<dyn Error>`, and other behavior.
- Two different construction paths for ordinary `ContextError<C, E>` and `ContextError<C, Error>`.
- Compatibility implementations for different Rust versions, features, and cfg combinations.
- More details around pointer provenance, aliasing, and panic safety.

But once those engineering details are set aside, the complete core skeleton is already here:

```text
MyAny
  |
  v
Own<MyAnyImpl>
  |
  v
MyAnyImpl<T> = vtable + value
                         |
                         └── T or Wrapper<C, MyAny>
```

To finish, here are all the unsafe invariants on which this implementation relies:

1. `Own<MyAnyImpl>` must originate from a real `Box<MyAnyImpl<T>>`; it cannot be fabricated out of thin air.
2. The real `T` stored in the allocation must exactly match the `T` for which the vtable was monomorphized.
3. `MyAnyImpl` and `Wrapper` must preserve the layouts assumed by the code, or none of the pointer casts are valid.
4. An erased pointer may be restored to the target type only after its `TypeId` has matched.
5. `ptr::read` may move the target value only once. The following `drop_rest` must skip that value while still cleaning up every other field and allocation.
6. The lifetimes inside `Ref` and `Mut` must originate from real `&self` and `&mut self` borrows; unsafe code must not extend them arbitrarily.
7. Every allocation may be reconstructed as a `Box` and freed exactly once.

Break any one of these rules and the result ranges from a memory leak to use-after-free, double free, or multiple aliasing `&mut` references. Unsafe does not make Rust's rules disappear; it merely changes "proved by the compiler" into "proved by the programmer."

That is the most interesting part of reading the `anyhow` source. At first it looks like a pile of raw pointers, vtables, and `ManuallyDrop` black magic. Once taken apart, though, every step is really restoring some piece of information lost during the previous type-erasure step. The final goal is not to evade Rust's type system, but to manually build a sufficiently reliable dynamic type system while keeping `anyhow::Error` to a single word.
