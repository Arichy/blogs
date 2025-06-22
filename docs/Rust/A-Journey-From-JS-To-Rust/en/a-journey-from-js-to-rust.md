This article is for developers with a background in frontend/JS/TS, introducing some of the confusions, differences, and new concepts encountered when learning Rust.

JS, with its highly dynamic and flexible scripting language features, allows us to write code with maximum freedom, doing whatever we want, basically coding without a second thought. (Do you think about memory safety and concurrency safety when writing JS? I almost never do.)

1.  Built-in GC, so no need to consider memory management; object references can fly around freely.
2.  Dynamic typing, so no need to consider types when assigning/modifying variables.
3.  Extensive use of reference types, so no need to consider memory layout or distinguish between stack/heap.
4.  Popular runtimes are mostly single-threaded + built-in event loop, so almost all concurrency issues are non-existent.

However, in the world of Rust, all the above details must be firmly kept in mind by the developer. This also leads to discomfort for JS/Python, and even Java/Go developers when learning Rust, requiring them to step far out of their comfort zones. No runtime helps us encapsulate and handle numerous low-level details anymore; only the compiler battles with us, repeatedly.

# 0. Pronunciation

Rust has its own unique naming conventions, some of which don't quite align with the conventions of other mainstream languages. For instance, the concept of an `interface` is called a `trait` in Rust. What's similar to a `package` in JS is called a `crate` in Rust. At the same time, Rust's design philosophy is to minimize source code characters as much as possible. Thus, function definitions use `fn`, not `func` like in Go, nor `function` like in JS; mutability uses `mut`, not the full `mutable`; implementing a trait uses `impl`, not the full `implement`; and strings include two types, `str` and `String`. So, to begin, let's introduce the common pronunciations within the Rust community.

## Keywords/Syntax Elements

| Symbol/Word | Pronunciation                     | Category      | Notes                            |
| ----------- | --------------------------------- | ------------- | -------------------------------- |
| `str`       | /stɜr/ (like “stir”)              | Type          | The `str` in `&str`, not “S-T-R” |
| `impl`      | /ɪmpl/ (like “imp-l”)             | Keyword       | Abbreviation for implement       |
| `dyn`       | /dɪn/ or /daɪn/ (both are used)   | Trait Keyword | Abbreviation for dynamic         |
| `crate`     | /kreɪt/ (like “create” without e) | Module System | A package or module unit in Rust |
| `trait`     | /treɪt/                           | Interface     |                                  |
| `enum`      | /ˈiːnəm/ or /ˈɛnəm/               | Enum Type     |                                  |
| `mod`       | /mɑd/ (like “mod”ify)             | Module        | Abbreviation for module          |
| `mut`       | /mjut/ (like mute)                | Mutability    | Abbreviation for mutable         |
| `fn`        | /ɛf ɛn/ (F-N)                     | Function      | Declares a function              |

## Types/Structs

| Name  | Pronunciation                        | Meaning                         |
| ----- | ------------------------------------ | ------------------------------- |
| `Vec` | /vɛk/ (like “veck”) or spelled V-E-C | Vector type                     |
| `Rc`  | /ɑr si/ (R-C)                        | Reference Counted smart pointer |
| `Arc` | /ɑrk/ (like “ark”)                   | Atomic Reference Counted        |

# 1. Basic Content: `mut`

For developers from most language backgrounds, `mut` is a very new and somewhat inexplicable design. When we write JS, we never consider whether a variable is mutable; by default, all variables are mutable. Even for a variable `some_obj` defined with `const`, it only means `some_obj` itself cannot be reassigned to another value, but the object `some_obj` refers to can be arbitrarily modified, such as adding/deleting/modifying fields.

However, Rust requires using `mut` to explicitly declare a variable as mutable, and this mutability restriction applies to the entire object tree. If a struct variable doesn't have `mut`, its fields cannot be modified either. There are several reasons for this:

1.  One of Rust's design philosophies is explicitness whenever possible. For example, using `mut` to explicitly declare a variable as mutable means that variables without `mut` are immutable. When you see such a variable, you don't have to worry about its value changing anywhere later, reducing cognitive load.
2.  Rust's Borrow Checker has a rule: **For the same value T, you cannot have both a mutable reference `&mut T` and an immutable reference `&T` at the same time**, so it's necessary to distinguish mutability.

# 2. Advanced Content: Hello World

Yes, you read that right, printing "hello world" is advanced content in Rust.

When learning other languages, we almost always start by printing "hello world". For example:

```javascript
// Popular JavaScript Runtime
console.log('hello world');
```

```go
// Go
fmt.Println("hello world");
```

```java
// Java
System.out.println("hello world");
```

With one line, we can learn at least two things about the language:

1.  How to declare strings.
2.  How to print things.

Okay, now let's look at Rust's hello world:

```rust
println!("hello world");
```

It looks simple, but it hides at least four subtle yet important concepts: strings, lifetimes, fat pointers, and macros.

## 2.1. Strings

If you extract "hello world" into a variable, in an editor with rust-analyzer (Rust's language server, hereinafter referred to as ra) installed, it will show you the variable type:

```rust
fn main() {
  let hello_world: &'static str = "hello world";
}
```

The variable type is `&'static str`, which can be immediately confusing. The complete and accurate English translation is `a reference to a string slice with a static lifetime`. Let's break it down. First, this is a reference type, essentially a pointer, pointing to a type `str`. `str` is translated as `string slice`, and it is **one type** of string. Yes, Rust has many types of strings. A static lifetime means that during the program's execution, the `str` value this reference points to will never be destroyed and will live forever.

In the compiled binary (e.g., an ELF file on Linux) from the code above, the string "hello world" will exist in some `PT_LOAD` segment (on disk). When the operating system loads this binary for execution, it will load this string into the `.rodata` section (in memory), and then allocate a pointer on the `main` function's stack frame, which is the `hello_world` variable, pointing to this `str` type string "hello world".

```
Memory Layout
+--------------------------------------------------+
|                                                  |
|  Stack:                                          |
|  +--------------------------------------------+  |
|  |                                            |  |
|  |  hello_world: &'static str                 |  |
|  |  +---------------+---------------+         |  |
|  |  | ptr           | len           |         |  |
|  |  | 0x12345678    | 11            |         |  |
|  |  +---------------+---------------+         |  |
|  |        |                                   |  |
|  +--------|-----------------------------------+  |
|           |                                      |
|           |                                      |
|           |                                      |
|  .rodata: |                                      |
|  +--------|-----------------------------------+  |
|  |        |                                   |  |
|  |        v                                   |  |
|  |  0x12345678: "hello world"                 |  |
|  |  +---+---+---+---+---+---+---+---+---+---+---+  |
|  |  | h | e | l | l | o |   | w | o | r | l | d |  |
|  |  +---+---+---+---+---+---+---+---+---+---+---+  |
|  |                                            |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
```

Because this "hello world" is located in the `.rodata` section, it will live for the entire duration of the program's execution, so the reference `hello_world` pointing to it has a `'static` lifetime. In Rust statements, lifetimes can be elided (hidden). Therefore, in many cases, we see the type `&str`, which is `a reference to a string slice`, or simply `string reference`.

Why use a reference type `&str` instead of directly using the `str` type? It's because Rust requires the size of every variable to be known at compile time. Rust allocates local variables on the stack by default, and stack allocation requires a specific size, so the size of each variable in a stack frame must be known. However, the size of the `str` type is unsized (not known at compile time) because you cannot know the size of an arbitrary `str` type string at compile time. The `&str` mentioned above points to a static "hello world" string, so its length is known, but `&str` can also point to dynamic strings whose size can change arbitrarily at runtime. Therefore, the size of `str` cannot be determined at compile time, so we can only use the `&str` reference type, because the size of a reference type is determinable.

From the memory layout diagram, we can see that `&str` is not just a simple pointer; it also contains a length field `len`, used to indicate the length of the `str` it points to. In C, strings are terminated by a special character `\0`, so their length doesn't need to be stored explicitly. However, Rust's mechanism doesn't use `\0`, so a length field is needed. This type of pointer that carries extra information is called a fat pointer. So, `&str` has a fixed size of 2 `usize`s. `usize` is an integer type that is platform-dependent, representing the size of a pointer on the current platform. On a MacBook with Apple Silicon, this size is 64 bits, or 8 bytes. Therefore, an `&str` is 16 bytes.

Having finally introduced `str` and `&str`, let's now introduce `String`. `String` is a type that is allocated on the heap because it is essentially a `Vec<u8>`, and `Vec` is allocated on the heap.

```rust
fn main() {
    let mut hello_string = String::from("hello");
}
```

```
Memory Layout
+--------------------------------------------------+
|                                                  |
|  Stack:                                          |
|  +--------------------------------------------+  |
|  |                                            |  |
|  |  hello_string: String                      |  |
|  |  +---------------+---------------+---------+  |
|  |  | ptr           | len           | capacity |  |
|  |  | 0xABCDEF      | 5             | 5        |  |
|  |  +---------------+---------------+---------+  |
|  |        |                                   |  |
|  +--------|-----------------------------------+  |
|           |                                      |
|           |                                      |
|           |                                      |
|  Heap:    |                                      |
|  +--------|-----------------------------------+  |
|  |        |                                   |  |
|  |        v                                   |  |
|  |  0xABCDEF:                                |  |
|  |  +---+---+---+---+---+                     |  |
|  |  | h | e | l | l | o |                     |  |
|  |  +---+---+---+---+---+                     |  |
|  |                                            |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
```

Let's ignore the `len` and `capacity` of `hello_string` for now; we'll discuss them later when we introduce `Vec`. A `String` type variable allocates memory on the heap to store the string and then uses a pointer on the stack to point to it. Because the underlying data of `String` is allocated on the heap, its length is naturally variable. When we need a mutable string, we use `String`.

```rust
// Common ways to create a String, with 1 and 2 being the most used
let s = "hello".to_string(); // Call the to_string method of &str
let s = String::from("hello"); // Call the from method of the From<&str> trait implemented by String
let s: String = "hello".into(); // Because String implements From<&str>, &str automatically implements Into<String>. However, since &str implements multiple Into traits, the type of s needs to be explicitly declared.
let s = "hello".to_owned(); // Call the to_owned method in the ToOwned trait implemented by str
let s = String::new(); // Create an empty string
let s = String::default(); // Call the default method of the Default trait implemented by String, creating an empty string

// Modify String
let mut s = "hello".to_string(); // s: "hello"
s.push_str(" world"); // s: "hello world"
```

`&str` and `String` are the two most commonly used string types in Rust, but Rust also provides other string types: `PathBuf` vs `Path`, `OsString` vs `OsStr`, etc. These are essentially no different from `String` vs `&str` but are used in specific domains. For example, `Path` is a wrapper around `OsStr`, and `OsStr` is a wrapper around `[u8]`, but specifically for path-related operations, such as arguments to file reading functions. Thus, they will have additional specific methods like `is_dir`, `is_absolute`, etc.

This is also one of Rust's design philosophies: values that are essentially the same type will be wrapped into different types in different contexts. A classic example is time points and time durations.

In JS, we use `number` to represent timestamps, i.e., a point in time. We also use `number` to represent a duration of time:

```typescript
// Represents a timestamp 1000ms in the future

const now: number = Date.now();
const duration_ms: number = 1000;
const then: number = now + duration_ms;
```

The problem with this is that when I get a variable of type `number`, it's hard to determine what this variable actually represents. It could be a time point, a duration, age, mass, physical attack, or magic penetration.

In Rust, although they are essentially integer-like data, they are wrapped into different types in different scenarios:

```rust
use std::time::{Duration, Instant};
use std::thread;

let now: Instant = Instant::now(); // Please note Instant::now does not return the current wall-clock time
let duration_ms: Duration = Duration::from_millis(1000);
let then: Instant = now + duration_ms;
```

This way, when I call a function like `thread::sleep` that expects a `Duration`, I won't pass an `Instant` or other integer types.

FYI, JS's new time module [Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal) also introduces the distinction between `Duration` and `Instant`.

## 2.2. Macro

You must be curious why some "function calls" have an exclamation mark at the end, while others don't. For example, `"hello".to_string()` doesn't have an exclamation mark, but `println!()` and `write!()` do. This is because `println` and `write` here are not functions, but declarative macros.

A declarative macro is a type of macro that uses a mechanism similar to regular expression matching to match internal code and then transform it into another set of code. Since the code `println` ultimately transforms into is special compiler-handled code, we'll use `vec!`, a declarative macro for initializing a vector with an arbitrary number of elements, as an example.

```rust
macro_rules! vec {
    () => (
        $crate::vec::Vec::new()
    );

    ($elem:expr; $n:expr) => (
        $crate::vec::from_elem($elem, $n)
    );

    ($($x:expr),+ $(,)?) => (

        <[_]>::into_vec(
            $crate::boxed::Box::new([$($x),+])
        )
    );
}
```

A declarative macro defines multiple branches, each representing a match. At the beginning of compilation, matching is performed. When a branch is matched, the code corresponding to that branch replaces the original code. For example:

```rust
let vec = vec![1, 2, 3];
// Will be replaced with
let vec = <[_]>::into_vec(#[rustc_box] ::alloc::boxed::Box::new([1, 2, 3]));
```

Since declarative macros are quite complex, we won't go into too much detail here. Just know that they expand and replace original code at the beginning of compilation. So, the question is, why are `println!` and `vec!` designed as macros instead of directly providing `println` and `vec` functions? Because the number of arguments for a Rust function must be fixed. Rust also doesn't support function overloading. However, for `println!`, the number of arguments is not fixed; it depends on how many slots need to be inserted and replaced in the template string. Similarly, the number of initial elements `vec!` accepts cannot be fixed. Therefore, these two are designed as macros, expanding at the beginning of compilation to call another function with a fixed number of arguments.

Rust macros are divided into the following categories:

- declarative macros
- procedural macros
  - function-like macros
  - derive macros
  - attribute macros

Here, we'll only briefly introduce procedural macros without going into depth. The three types of procedural macros are essentially functions that take `TokenStream` (representing a piece of input Rust code) as an argument and return a `TokenStream` (representing a piece of output Rust code). At the beginning of compilation, this function is executed, and then the Rust code corresponding to the return value is generated.

Declarative macros perform a match, hence the name "declarative." I declare several branches; if you match one, I perform the replacement. Procedural macros execute a function, hence the name "procedural." Beginners often fall into the trap of seeing macro invocations like `println!("hello")` that look like function calls and assume they are function-like macros. This is incorrect. Declarative and procedural macros are distinguished by how they operate on the input code.

FYI, you can install the [cargo-expand](https://github.com/dtolnay/cargo-expand) tool using `cargo install expand`. After installation, you can use the `cargo expand` command to view the expanded results of some macros.

# 3. Array vs Vec

In JS, `Array` is probably one of the most used data structures, if not the most. We are already familiar with various operations on arrays, including creation, and inserting/deleting elements at any position. Unfortunately, in Rust, the array type is `[T; N]`, where `T` is the element type and `N` is the number of elements, and **the number of elements must be determined at compile time**. This is quite restrictive; the array length must be fixed when writing the code, making its flexibility very limited. This also means the use cases for array types are very limited; even a basic function for iterating and printing cannot take an array as a parameter in a generic way (without knowing its size).

So, in Rust, the `Vec` (vector) struct is used more often, which is also the underlying data structure for the `String` type. `Vec` is similar to JS's `Array`; its length is variable, and you can play with it however you want. In the memory layout diagram for `String`, we saw that `Vec` consists of three parts:

- `ptr`: A pointer to the actual data on the heap, pointing to the first element in the vec.
- `len`: The current length of the vec, i.e., the current number of elements.
- `capacity`: The current capacity of the vec.

The first two are relatively easy to understand, but `capacity` is a bit puzzling. Simply put, `capacity` is the maximum number of elements the current vec can hold, and `capacity` is always `>= len`. When `capacity == len`, the vec is full. At this point, if you execute methods like `vec.push` to insert elements, the vec will first reallocate (grow), which means allocating a new block of memory with a larger `capacity` (usually current `capacity` \* 2), then moving all its existing elements to the new location, and then inserting the new element. Of course, this reallocation might happen in place, meaning the starting point of the new memory is the same as the current memory's starting point, in which case the elements don't need to be moved. Therefore, strictly speaking, the time complexity of the `push` method is not necessarily `O(1)`; it can be `O(n)` when reallocation occurs.

At this point, we can explain the reason for the rule: "For the same value T, you cannot have both a mutable reference `&mut T` and an immutable reference `&T` at the same time." Consider the following code:

```rust
let mut v = vec![1, 2, 3, 4]; // 1

let v_shared_ref = &v; // 2. First, get a shared reference (immutable reference)
v.push(5); // 3. Then, get a mutable reference; the push method automatically creates a mutable reference

println!("{:?}", *v_shared_ref); // ❌ 4. Using the shared reference created in 2
```

At step 3, an immutable reference and a mutable reference (implicitly taken by `push`) would exist simultaneously (if allowed by the compiler, which it isn't for this specific sequence). This violates the rule. The consequence (if the compiler didn't prevent it) could be that in step 3, because the vec reallocates, the entire vec is moved to a newly allocated address, while the original `v_shared_ref` still points to the old address, becoming a dangling pointer. In step 4, dereferencing it would cause undefined behavior. Memory safety would be compromised.

# 4. Enum and Pattern Matching

`enum` in TS is not a very good design, [has many problems](https://www.google.com/search?q=don%27t+use+enum+in+typescript), is not used much in actual development, and therefore is not given much importance.

However, in Rust, enum is an extremely important structure. The reason is simple: **Rust does not have union types**; Rust only has sum types (which enums provide). So Rust can only use enums to achieve the effect of union types. Moreover, Rust's enums are much more powerful than those in other languages because they support carrying data (variants can have associated types), in conjunction with Rust's own `pattern matching` language feature.

Suppose we want to implement a `printAdd1` function whose parameter can be a string or a number. If it's a string, print the result of string + "1". If it's a number, print the result of number + 1. In TS, we would write:

```typescript
function printAdd1(val: string | number) {
  if (typeof val === 'string') {
    console.log(`${val}1`);
  } else {
    console.log(val + 1);
  }
}
```

But in Rust, we need to use an enum:

```rust
enum StringOrNumber {
    String(String),
    Number(i32),
}

fn print_add_1(val: StringOrNumber) {
    match val {
        StringOrNumber::String(s) => {
            println!("{}1", s);
        }

        StringOrNumber::Number(n) => {
            println!("{}", n + 1);
        }
    }
}
```

Enums are ubiquitous in Rust.

## 4.1. Potentially Null Values: `Option<T>`

Rust does not have `null`. So, to express a variable `T` that might have a value or might be empty, an enum is needed: `Option<T>`.

For example, to implement a division function, in TS we would do this:

```typescript
function divide(a: number, b: number): number | null {
  if (b === 0) {
    return null;
  }

  return a / b;
}

const result = divide(userInput1, userInput2);

if (result === null) {
  // handle null
}
// handle result
```

In Rust, we need:

```rust
fn divide(a: f64, b: f64) -> Option<f64> {
  if b == 0.0 {
    None
  } else {
    Some(a / b)
  }
}

let result = divide(user_input_1, user_input_2);

match result {
  Some(result_val) => {
    // handle result_val
  }

  None => {
    // handle null
  }
}
```

## 4.2. Error Handling: `Result<T, E>`

For the `divide` function above, we can also use `Result<T, E>` as the return value.

```rust
fn divide(a: f64, b: f64) -> Result<f64, String> {
    if b == 0.0 {
        Err("0 could not be the denominator".to_string())
    } else {
        Ok(a / b)
    }
}

let result = divide(2.0, 1.0);

match result {
    Ok(result_val) => {
        // handle result_val
    }

    Err(reason) => {
        // handle error
    }
}
```

`E` itself has no restrictions and can be any type. However, `E` will usually be a type that implements the `Error` trait.

## 4.3. `unwrap`

If you find `Option` and `Result` too cumbersome, and you just want to simply read file content without writing a bunch of `match` statements to handle the result, then `unwrap` will bring you back to your comfort zone for a while.

```javascript
// read a file in JS
import { readFileSync } from 'fs';
const content = readFileSync('/path/to/some_file', 'utf-8');
console.log(content);
```

```rust
// read a file in Rust
use std::fs;
let content = fs::read_to_string("/path/to/file").unwrap();
println!("{content}");
```

`unwrap` is a method available on both `Option` and `Result`.

- For `Option<T>`, it returns the `T` wrapped in `Some(T)`. If it's `None`, it will `panic`.
- For `Result<T, E>`, it returns the `T` wrapped in `Ok(T)`. If it's `Err(E)`, it will `panic`.

In a formal production environment, `unwrap` should only be used when you are absolutely sure there will be no problem, to simplify code.

# 5. Trait

Another design characteristic of Rust is its unconventional naming. In other languages, this concept is almost always called `interface`, but Rust names it `trait`. The concepts are very similar, but traits are more powerful, arguably the cornerstone of the entire Rust program structure or ecosystem. At all times, we need to think about problems in terms of traits, which is another major point of discomfort for JS developers. In JS, when using third-party libraries, we basically only focus on the functions/classes/objects they provide and then directly call existing methods. But in Rust, we also need to pay attention to traits. When using third-party crates, often we will only use traits, making our own structs implement the traits they provide, and then use their functionality.

A trend in the programming world today is to reduce object-oriented programming. Newer languages like Go/Rust have almost completely abandoned OOP, no longer having concepts like class, object, extends, etc. Although JS simulates classes through prototypes, the current community trend is also abandoning OOP, a typical example being React using function components + hooks (functional programming + composition over inheritance thinking) to replace class components.

Rust's traits are the best embodiment of composition over inheritance. For a struct, we don't judge what methods it has by thinking about its inheritance relationships, but by thinking about which traits it implements. Our thinking should include:

- My struct needs to implement certain methods, so these methods are likely already defined in an existing trait in the standard library, so I need to make my struct implement this trait.
- My function may need to operate on multiple types, but these types must satisfy certain common conditions, so I need to constrain the function's generic parameters to satisfy one or more traits.

Everything in Rust is implemented around traits. For example, basic printing: in JS, we can use `console.log` to print anything, but not in Rust. This is because in JS, there are many things we don't think about, such as whether the thing to be printed is serializable and in what format it should be serialized. The JS runtime solves these problems for us. But Rust doesn't solve them for us; we need to think about them ourselves.

```rust
println!("{}", some_variable);
println!("{:?}", some_variable);
```

Both methods above can print `some_variable`. In the first method, `some_variable` is required to implement the `std::fmt::Display` trait. In the second method, it is required to implement the `std::fmt::Debug` trait. The difference is that `Display` is generally a human-readable format, while `Debug` is a format for programmers to easily debug. For example, when printing a string, `Display` will only print the string itself, while `Debug` will additionally print the surrounding double quotes.

```rust
struct Coordinate {
  x: i32,
  y: i32,
}

let c = Coordinate {
  x: 1,
  y: 2,
};

println!("{}", c); // Error: Coordinate does not implement Display
println!("{:?}", c); // Error: Coordinate does not implement Debug
```

Both print statements above will error because `Coordinate` implements neither `Display` nor `Debug`. Generally, we use `#[derive(Debug)]` to automatically implement `Debug` for custom structs, facilitating debugging during development. The prerequisite for automatically deriving `Debug` is that all fields within the struct must have already implemented `Debug`. For example, `x` and `y` in `Coordinate` are `i32`, which both implement `Debug`, so `Debug` can be derived. However, `Display` cannot be automatically derived; if needed, it must be implemented manually.

```rust
#[derive(Debug)]
struct Coordinate {
    x: i32,
    y: i32,
}

impl std::fmt::Display for Coordinate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "({}, {})", self.x, self.y)?;

        Ok(())
    }
}

let c = Coordinate { x: 1, y: 2 };
println!("{c}"); // (1, 2)
println!("{c:?}"); // Coordinate { x: 1, y: 2 }
```

From the results, we can also see that `Display` prints for humans, while `Debug` prints for programmers.

# 6. Closures vs Functions

Closures are a concept not given much importance in JS. When we define functions, we rarely think about whether they are closures. The word "closure" doesn't appear much in the JS community. But in Rust, closures are a very important concept that needs to be memorized separately.

Simply put, a closure is essentially a **struct** that captures external variables; it is not a function. In Rust, all variables need to have their storage location clearly determined. The so-called "captured variables" also need to be stored somewhere, so closures are compiled into structs, storing the captured variables within the struct.

```rust
let to_add = 1;
let f = |i: i32| {
    let tmp = 0;
    tmp + i + to_add
};

let result = f(42);
```

The above code will be compiled into something like this:

```rust
// Conceptual representation
struct F_Closure {
    to_add: i32,
}

impl FnOnce<(i32,)> for F_Closure {
    type Output = i32;
    extern "rust-call" fn call_once(self, args: (i32,)) -> Self::Output {
        let tmp = 0;
        tmp + args.0 + self.to_add
    }
}

impl FnMut<(i32,)> for F_Closure {
    extern "rust-call" fn call_mut(&mut self, args: (i32,)) -> Self::Output {
        let tmp = 0;
        tmp + args.0 + self.to_add
    }
}

impl Fn<(i32,)> for F_Closure {
    extern "rust-call" fn call(&self, args: (i32,)) -> Self::Output {
        let tmp = 0;
        tmp + args.0 + self.to_add
    }
}

let f = F_Closure { to_add };

let result = f.call((42,));
```

A Rust closure is a struct that implements the `FnOnce/FnMut/Fn` traits. Captured variables are stored in the struct, and when called, the corresponding `call_once/call_mut/call` method is invoked.

- `FnOnce`: Receives `self`, calling it consumes `self`, so it can only be called once.
- `FnMut`: Receives `&mut self`, calling it allows modification of the struct (i.e., captured variables), can be called multiple times.
- `Fn`: Receives `&self`, calling it does not allow modification of the struct, can be called multiple times.

The relationship between these three traits is: `Fn` is a sub-trait of `FnMut`, which is a sub-trait of `FnOnce`. This is ordered from most to least restrictive in terms of what the closure body can do. `Fn` is the most restrictive, only allowing immutable access to captured variables. `FnOnce` is the least restrictive, allowing anything.

Importantly, Rust closures are complex types, so `ra` will tell you the type of `f` is `impl Fn(i32) -> i32`, indicating that `f` is a struct that implements `Fn`, but its specific name is unknown. Because Rust generates a unique struct for each closure, no two closures can have the same type, even if their parameter lists, internal implementations, and return values are identical.

## 6.1. Capture by Reference vs Capture by Ownership

Rust can capture external variables by reference or by ownership.

```rust
let mut s = "hello".to_string();
let f = || {
    let b = s; // s is moved here
    b.push_str(" world");
};
f();

println!("{s}"); //  ❌ s has been moved into f
```

The `f` above implements `FnOnce` because when `f` is defined (or rather, when it would be called), `s` is moved into the `f` struct. When called, it's moved into the function body to `b`. Since `b` is a local variable within the function, it will be destroyed after the call, so this function can only be called once, consuming the entire struct.

```rust
let mut s = "hello".to_string();
let mut f = || { // f is inferred as FnMut
    s.push_str(" world"); // s is mutably borrowed here
};
f();

println!("{s}"); // ✅ s was not moved to f, so it can still be accessed here
```

Although `s` is used inside `f` above, because `push_str` only requires `&mut String`, only `&mut s` is captured. `s` remains accessible afterwards.

```rust
let mut s = "hello".to_string();
let mut f = move || {
    s.push_str(" world"); // s is owned by the closure now
};

f();
println!("{s}"); // ❌ s has been moved into f
```

By using the `move` keyword, we tell the compiler that `f` will capture ownership of `s`, so `s` will be moved into the `f` struct and is no longer accessible afterwards.

In concurrent programming, `move` is almost always used. For example, when creating a thread using `thread::spawn`, you must use `move` to move all captured external variables into the closure, passing them to the new thread, because the execution order and timing of the two threads are completely indeterminate. The main thread might finish before the new thread completes, thereby destroying variables on its own stack.

For regular functions defined with `fn`, they have specific types, e.g., `fn(i32) -> i32`. Therefore, multiple functions can be of the same type, and all regular functions implement `FnOnce` + `FnMut` + `Fn`. In other words, all regular functions can be used as closures.

# 7. Multithreading and Async

Due to the inherent difficulty of multithreading and async, this article will not describe them in excessive detail, only introducing some of the most basic concepts.

- Multithreading: Start multiple threads using methods in the `thread` module.
- Async: Similar to JS's `async/await`.

## 7.1. Multithreading

Suitable for CPU-bound tasks, can be processed in parallel. This point is often a blind spot for JS developers because popular JS runtimes only provide single-threaded access to developers, lacking the capability for true parallelism.

## 7.2. Async

Suitable for I/O-bound tasks, can be processed concurrently. When JS developers first encounter Rust's `async/await`, they will feel both familiar and strange. The familiar part is that the syntax is basically the same: `async` defines an asynchronous function, and `await` waits for an asynchronous function to return, just that in JS `await` is placed before the asynchronous call, while in Rust it's placed after. However, the strange parts are rather perplexing:

1.  The `main` function cannot be `async`. In JS, due to the infectious nature of `async/await`, if the `main` function cannot be `async`, what about all the `await` calls inside it?
2.  I've searched the entire standard library and haven't found a single `async fn`. Whether it's reading files or network requests, there isn't a single `async fn`. The familiar `const content = await readFile("xxx")` seems impossible to write.

This again comes back to Rust's design philosophy. The Rust standard library does not provide any asynchronous implementation, nor does it provide any asynchronous runtime; these are all left to third-party implementations in the community. Rust official only provides the `async/await` syntactic sugar, compiling it at the language level into synchronous-looking code (centered around the `Future` trait), but how to actually execute these futures, Rust official doesn't handle; you need to provide a runtime yourself to schedule them.

Currently, the de facto standard async runtime is [tokio](https://tokio.rs/). Beginners can just use tokio without much thought.

```rust
use tokio::fs::read_to_string;

#[tokio::main]
async fn main() {
    let content_result = read_to_string("/path/to/file").await;
    match content_result {
        Ok(content) => {
            // handle content string
        }
        Err(err) => {
            // handle error
        }
    }
}
```

Tokio provides a complete asynchronous ecosystem, including a scheduler, event loop (I/O, timers, etc.), asynchronous methods (fs, net, channel, etc.), and other features. At this point, you should again have the feeling that the reason we write JS so comfortably is that these contents are provided by the underlying runtime. For example, macro/micro tasks in JS are essentially tokio's scheduler. Node.js's event loop also has a corresponding implementation in tokio.

# 8. Forgetting Object-Oriented Programming

**Rust is not an object-oriented language**, so when learning it, it's best to set aside an object-oriented mindset (of course, strictly speaking, JS isn't an object-oriented language either, as it lacks classes). Rust does not have classes or inheritance, but it does borrow some features from OOP. For example, it implements encapsulation using `struct` + `impl` + `pub` visibility control, and it achieves polymorphism through various means.

## 8.1. The Essence of Method Calls

In Rust, there are technically no methods; all methods are just regular functions.

```rust
let mut nums = vec![1, 2, 3];

nums.push(4);
// is essentially
Vec::push(&mut nums, 4);
```

Essentially, every method call creates a reference to the instance (or passes the instance itself) based on the method's `self` type (`self`, `&self`, or `&mut self`), passes it as the first argument to the function, and then passes the remaining arguments. This understanding is very helpful when wrestling with lifetimes. Explicitly writing out `&mut xx` makes it clearer that a mutable reference is being created at that point, which aids in reasoning about its lifetime.

## 8.2. Generics for Parametric Polymorphism

Parametric polymorphism refers to a function's ability to perform the same operation on different types. Rust uses generics to achieve parametric polymorphism, performing **monomorphization** on generic functions at compile time. Monomorphization means that for every type that calls the generic function, a unique function specific to that type is generated.

```rust
fn get_first<T>(slice: &[T]) -> &T {
    &slice[0]
}

let nums = vec![1, 2, 3];
let strings = vec!["1".to_string(), "2".to_string(), "3".to_string()];

let first_num = get_first(&nums);
let first_string = get_first(&strings);
```

The code above will be monomorphized into two different functions:

```rust
fn get_first_i32(slice: &[i32]) -> &i32 {
    &slice[0]
}

fn get_first_String(slice: &[String]) -> &String {
    &slice[0]
}

let first_num = get_first_i32(&nums);
let first_string = get_first_String(&strings);
```

As you can see, the calls for `&nums` and `&strings` invoke two different functions. The advantage of this is extreme performance with zero runtime overhead, as the compiler knows exactly which function to call at compile time. The disadvantage is that if many different types use this function, generating a function for each type can lead to a larger binary bundle size.

Generics implement static dispatch because the specific function being called is known statically at compile time. This might be unfamiliar to JS programmers because TypeScript generics are erased at compile time, so no static dispatch occurs.

## 8.3. Trait Objects for Subtype Polymorphism

Subtype polymorphism means that an object of a subtype can be used as if it were of its parent type. When a method is called through a reference to the parent type, the method on the subtype is called preferentially. Since Rust has no classes and inheritance, there is no parent-child relationship. Instead, this relationship is between a type and a trait. If a function doesn't care about the concrete type of its parameter but only that it implements a certain trait, it can use a trait object.

```rust
    fn get_string(input: Box<dyn ToString>) -> String {
        input.to_string()
    }

    let res1 = get_string(Box::new("123"));
    let res2 = get_string(Box::new(456));
```

The `dyn ToString` above is a trait object, representing any type that implements the `ToString` trait. Since the concrete type is unknown, its size is also unknown. Rust requires every parameter/variable to have a concrete size, so it must be placed within a pointer type. The most common one is `Box`, or you can use a reference `&dyn ToString`. Inside the `get_string` function, the `input` has lost its concrete type, becoming a `Box<dyn ToString>` trait object instead. Therefore, you can only call methods from the `ToString` trait, such as `to_string`.

The requirement above can also be met with generics, but some scenarios exclusively require trait objects. A classic example is collection types like arrays, slices, or `Vec`:

```rust
fn get_strings<T: ToString>(input: &[Box<T>]) -> Vec<String> {
    let mut vec = vec![];
    for item in input {
        vec.push(item.to_string());
    }

    vec
}

let res = get_strings(&[Box::new("123"), Box::new(456)]);
```

The code above will produce an error:

```
error[E0308]: mismatched types
  --> src/main.rs:99:46
   |
99 |     let res = get_strings(&[Box::new("123"), Box::new(456)]);
   |                                              ^^^^^^^^^^ expected `&str`, found integer
   |
   = note: expected type `Box<&str>`
              found type `Box<{integer}>`
```

This is because all elements in a collection type must have the exact same type, but `Box<&str>` and `Box<i32>` are clearly different types and cannot be placed in the same slice. This is where trait objects become necessary:

```rust
fn get_strings(input: &[Box<dyn ToString>]) -> Vec<String> {
    let mut vec = vec![];
    for item in input {
        vec.push(item.to_string());
    }

    vec
}

let res = get_strings(&[Box::new("123"), Box::new(456)]);
```

Now, the element type of this slice is `Box<dyn ToString>`, which is a single, consistent type. This scenario becomes even more apparent with closures, as each closure has a unique, unnameable type. If you want to store them in a collection, you must use a trait object, such as `Box<dyn Fn(i32, i32) -> i32>`.

Trait objects implement dynamic dispatch because the concrete function for `item.to_string` is not known at compile time. At compile time, a structure called a vtable is created and placed in a read-only data segment (like the `.rodata` section). Then, at runtime, this vtable is used to find the actual function to call and execute it. The process is as follows:

```rust
trait Animal {
    fn speak(&self) -> String;
    fn number_of_legs(&self) -> u8;
}

struct Dog;
impl Animal for Dog {
    fn speak(&self) -> String { "Woof!".to_string() }
    fn number_of_legs(&self) -> u8 { 4 }
}

struct Cat;
impl Animal for Cat {
    fn speak(&self) -> String { "Meow!".to_string() }
    fn number_of_legs(&self) -> u8 { 4 }
}

fn main() {
    // This conversion is the key moment that triggers the creation and use of the vtable!
    let dog_animal: Box<dyn Animal> = Box::new(Dog);
}
```

### 1. Static Construction at Compile Time

When the compiler processes the line `let dog_animal: Box<dyn Animal> = Box::new(Dog);`, it performs the following series of operations:

**1.1. Identify the `trait-type` Combination**
The compiler recognizes a conversion from the concrete type `Dog` to the trait object `dyn Animal`. It locks onto this combination: (`Dog`, `dyn Animal`).

**1.2. Find and Analyze the Trait and `impl`**
The compiler looks at the `Animal` trait definition. It knows that any `dyn Animal` must be able to call the `speak` and `number_of_legs` methods.

**1.3. Construct the Vtable's Memory Layout**
The compiler determines the structure of the vtable for the `dyn Animal` trait object. It is essentially an array (or struct) of function pointers, with a layout roughly like this:

```c
// This is pseudo-code describing the internal structure of the vtable
struct VTableForAnimal {
    // 1. Pointer to the destructor (for correctly dropping the object)
    void (*_drop_in_place)(void*);

    // 2. The object's size and alignment
    size_t size;
    size_t align;

    // 3. Function pointers to each method in the Trait
    String (*speak)(void*); // Points to Dog::speak
    u8 (*number_of_legs)(void*); // Points to Dog::number_of_legs
}
```

Note that the vtable contains not only pointers to trait methods but also three important pieces of metadata: a destructor pointer, size, and alignment. This enables `Box<dyn Animal>` to know how to correctly free the memory of the "type-erased" object it points to.

**1.4. Create and Store a Static Vtable Instance**
The compiler creates a global, static, read-only vtable instance for the (`Dog`, `dyn Animal`) combination. This vtable instance is placed in the read-only data section (e.g., the `.rodata` section) of the final executable file. It looks something like this:

```c
// Pseudo-code: The compiler generates such a constant in the .rodata section
const VTableForAnimal VTABLE_DOG_AS_ANIMAL = {
    .drop_in_place = &drop_dog,      // Points to Dog's destructor logic
    .size = size_of::<Dog>(),        // The size of the Dog type (which is 0 here)
    .align = align_of::<Dog>(),      // The alignment of the Dog type
    .speak = &Dog::speak,            // Points to the machine code address of the Dog::speak function
    .number_of_legs = &Dog::number_of_legs // Points to the machine code address of the Dog::number_of_legs function
};
```

- This vtable is not created for each `Dog` object. Instead, all `Dog` types share the same single vtable instance when used as a `dyn Animal`.
- Similarly, the compiler would create another separate, static vtable for the (`Cat`, `dyn Animal`) combination: `VTABLE_CAT_AS_ANIMAL`.

### 2. Pointer Combination at Runtime

After all the above preparations are completed at compile time, what happens at runtime becomes very simple.

When the line `let dog_animal: Box<dyn Animal> = Box::new(Dog);` is executed at runtime:

**2.1.** `Box::new(Dog)` allocates memory on the heap to store a `Dog` instance.

**2.2.** During the `Dog -> dyn Animal` conversion, a **fat pointer** is created.

**2.3.** This fat pointer consists of two parts:
_ **Data Pointer** -> Points to the address of the `Dog` instance on the heap.
_ **Vtable Pointer** -> Points to the address of the `VTABLE_DOG_AS_ANIMAL` that the compiler created and stored in the read-only data section.

```
    STACK                                      HEAP                                     .RODATA (Read-Only Data)
+------------------------+                     +-----------------+                    +============================+
| dog_animal             |                     | Dog Instance    |                    | VTABLE_DOG_AS_ANIMAL       |
| (Box<dyn Animal>)      |                     | (on the heap)   |                    | (static, read-only)        |
| +--------------------+ |                     +-----------------+                    |----------------------------|
| | data_ptr      | ---|---------------------->| (Dog's fields)  |                    | drop_ptr      | ---------> | (drop code for Dog)
| +--------------------+ |                                                            | size          | (e.g. 0)   |
| | vtable_ptr    | ---|------------------------------------------------------------->| align         | (e.g. 1)   |
| +--------------------+ |                                                            | speak_ptr     | ---------> | Dog::speak() code
+------------------------+                                                            | num_legs_ptr  | ---------> | Dog::number_of_legs() code
                                                                                    +============================+
                                                                                    | VTABLE_CAT_AS_ANIMAL       |
                                                                                    | (another static vtable)    |
                                                                                    | ...                        |
                                                                                    +============================+
```

When `dog_animal.speak()` is called:

**2.4.** The runtime follows the `vtable_ptr` from `dog_animal` to find `VTABLE_DOG_AS_ANIMAL`.

**2.5.** It looks up the function pointer corresponding to `speak_ptr` within the vtable.

**2.6.** It follows the `data_ptr` from `dog_animal` to find the address of the `Dog` instance and passes it as the `&self` argument.

**2.7.** It calls the function pointed to by the function pointer, which is `Dog::speak(&dog_instance)`.

## 8.4. Traits for Ad-Hoc Polymorphism

Ad-hoc polymorphism refers to the ability of a single operation to execute different logic depending on the types of its operands. This is different from parametric polymorphism, where the same operation is performed on different types. In ad-hoc polymorphism, different operations are performed on different types. The most typical example is function overloading, but Rust does not support function overloading.

Rust achieves ad-hoc polymorphism through traits. You can implement the same trait for different types, but with different specific implementations.

# Summary

From the flexibility and freedom of JS to the rigor and restraint of Rust, learning Rust is like transitioning from "doing whatever you want" to "walking on thin ice." JS runtimes shield us from low-level details like memory management and concurrency safety, allowing us to focus on rapidly implementing features. Rust, however, requires developers to confront these challenges directly, ensuring code safety and performance through strict compile-time checks.

This shift in mindset, though initially uncomfortable, will lead to more robust and efficient coding abilities once adapted. Rust's features like ownership, borrow checking, pattern matching, and traits are not just the essence of the language's design but also manifestations of modern programming paradigms. They compel you to organize code more clearly, reduce hidden bugs, and enhance program reliability.

If you're used to JS's "soaring freely," Rust might feel restrictive, but it's precisely this restriction that will ultimately lead you to write more stable and secure programs. Rust isn't about writing faster; it's about writing _correctly_.
