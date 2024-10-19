This article will explain variance and lifetime in Rust, with a combination with TypeScript. It's suit for Rust beginners with TypeScript background.

# What is variance

Variance is a common concept in type system in programming languages and wildly exists in many programming languages. **Variance is used to describe the feasibility of placing an A at a place which requires a B, if type A and type B have a parent-child relationship**.

If B is subtype of A, we could say B is more useful (or at least as useful as) than A, because B has all features which A has. Basically, along the dataflow direction, we could place a B at a place where an A is required. Variance is a conclusion for these scenarios, hiding the detail of dataflow direction.

Variance includes:

- covariance
- invariance
- contravariance

The general description of variance is:
**`T` is covariant / invariant / contravariant over `U`**. `T` is the main type to focus on, while `U` is part of `T`. Like in TypeScript:

- `T` is covariant over `T`
- `T[]` is covariant over `T`
- `(item: T) => void` is contravariant over `T`
  It's very important. It clarifies that variance is the relationship between a type and an inner type of it.

In Rust, there is no inheritance, so most of types have no parent-child relationship with each other. For better understanding, I'll use TypeScript to explain, with `strict: true` in `tsconfig.json`. I'll focus on explaining covariance and invariance, as these two are crucial for understanding lifetimes. Finally, I will briefly introduce contravariance.

## Covariance

Covariance means you could place a Child at a place requiring a Parent.

```typescript
class Animal {
  name = '';

  hello() {}
}

class Cat extends Animal {
  catchJerry() {}
}

function say(animal: Animal) {
  person.hello();
}

let cat = new Cat();

say(cat);
```

`say` expects the `person` to be `Animal`, but we could pass a `Cat` when calling it. Because `Cat` is subtype of `Animal`, `Cat` has all properties and methods in `Animal`. In other word, `Cat` is more useful than `Animal`. So `Animal` is covariant over `Animal`.

## Invariance

invariance means you could neither place a `Child` at a `Parent` place, nor could you place a `Parent` at a `Child` place. If a place needs `Child`, you could only place a `Child` exactly.
I didn't find invariance example in TypeScript, so I'll use a piece of code which could pass the TS compiler even if `strict: true` is enabled, but it will run into runtime error.

```TypeScript
const cat = new Cat('Tom');
const cats: Cat[] = [cat];

function handle(animals: Animal[]) {
	cats.push(new Animal('animal'));
}

handle(cats);

cats.forEach(cat => {
	cat.catchJerry(); // oops!
});
```

We passed a `cats: Cat[]` to `handle`, while `handle` expects it to be `Animal[]`, so it's absolute legal to insert a new `Animal` into it. However, `cats` does not know there is an `Animal` inside it. It still regards all the elements as `Cat`, resulting in the error.
On the other hand, if `handle` expects the argument to be `Cat[]`, obviously we could not pass an `Animal[]`. We could only pass a type `T[]` if the place needs a `T[]`. This is called invariance, only the exactly same type is allowed.
To emphasize again, this example code is only meant to illustrate a case that `T[]` is invariant in `T`. **In reality, TS does not handle it this way**. In TS, `T[]` is covariant in `T`.

## Data Flow Direction

Now let's break it down to see the difference. Why is it that sometimes you can pass a subtype in a place that requires a certain type, but other times you cannot? The reason is about **read and write**. In read-only scenarios, you can pass a subtype. In write-only scenarios, you can pass a supertype. In read-write scenarios, only the original type can be passed.

TypeScript does not support `pass-by-reference`, so I'll use a pice of pseudo code to illustrate.

```typescript
let animal: Animal = some_animal;
let cat:Cat = some_cat;

// readonly
let need_an_animal: Animal = some_cat; // place Child at Parent
need_an_animal.hello();

// writeonly
let need_a_cat: &Cat = &some_animal; // place Parent at Child
*need_a_cat = another_cat; // now `some_animal` is pointing to a cat, it's ok
some_animal.hello();
```

The fundamental reason for variance is that the data flow direction of read and write operations is opposite. Let's call the needed value (argument) is `need`, while the real value is `real`. Under read operations, data is flowing from `real` to `need`, so `real` needs to contain all info in `need`, or let's say `real` should be at least as useful as `need`. Conversely, under read operations, data is flowing from `need` to `real`, so `need` needs to contain all info in `real`, or let's say `need` should be at least as useful as `real`.
![data flow](https://github.com/Arichy/blogs/blob/main/docs/Rust/Variance-best-perspective-of-understanding-lifetime/imgs/data_flow.png?raw=true?raw=true)

## Mutability and Write

The reason why TS allows the erroneous code above, is that TS has no mutability declaration. TS does not know what would `handle` do on `animals`. Readonly? Or write? If TS was very strict and assumed both read and write operations would be done, the argument would only be exactly `Animal[]`, which would lose much flexibility. So TS strikes a balance between strictness and flexibility and allows the code.

On the contrary, it's compulsory to declare mutability in Rust, so the code above could not be compiled in Rust. That's the reason for many lifetime related errors as well.

A simple summary:

1. In TS, `T` is covariant in `T`, because TS thinks read is more fundamental than write, and it will protect read first.
2. In Rust, `&T` is covariant in `T`, because you could not mutate `T` via `&T`. Rust will guarantee that it's read-only and it's safe to read.
3. In Rust, `&mut T` is invariant, because you could mutate `T` via `&mut T`.

Then let's talk about lifetime.

## Variance in lifetime

There is no inheritance in Rust, so many types have no a parent-child relationship between each other. However, lifetimes do have. If `'a` encloses `'b` , then `'a` is subtype of `'b` (`'a: 'b` ). So lifetimes and variance are naturally tied together.
[Rust official reference](https://doc.rust-lang.org/reference/subtyping.html#variance) lists some variance

| Type                          | Variance in `'a` | Variance in `T` |
| ----------------------------- | ---------------- | --------------- |
| `&'a T`                       | covariant        | covariant       |
| `&'a mut T`                   | covariant        | invariant       |
| `*const T`                    |                  | covariant       |
| `*mut T`                      |                  | invariant       |
| `[T]` and `[T; n]`            |                  | covariant       |
| `fn() -> T`                   |                  | covariant       |
| `fn(T) -> ()`                 |                  | contravariant   |
| `std::cell::UnsafeCell<T>`    |                  | invariant       |
| `std::marker::PhantomData<T>` |                  | covariant       |
| `dyn Trait<T> + 'a`           | covariant        | invariant       |

Let's focus on the first 2 rows. Please pay special attention, `&'a T` is one type, but it contains other 2 types: `&'a` and `T`. `&'a T` has different variance in `&'a` and `'T`. Refer to the table, we could see both `&'a T` and `&'a mut T` are covariant in `'a`. **That's to say, we could place a `&'b T` / `&'b mut T` at a place requiring a `&'a T` / `&'a mut T`, as long as `'b: 'a`** . Please remember this, and it will make the lifetime of every reference much clearer.

## Covariance Lifetime

You must have seen the code below for many times:

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}

fn main() {
    let string1 = "hello".to_string(); // 1
    let string1_ref = &string1; // 2

    let res: &str; // 3

    { // 4
        let string2 = "myworld".to_string(); // 5
        res = longest(string1_ref, &string2); // 6
    } // 7

    println!("{}", res); // 8
    println!("{}", string1_ref); // 9
}
```

Now, forget about "`'a` is the shorter one of `x` and `y`". Let's understand it via variance. `'a` will be a specific type, instead of a "shorter one". I think a specific type is easier to understand than "shorter one", "at least", "at most".

For convenience, I'll use `1~2` to represent a lifetime between position 1 and 2 in code.

The code above is erroneous obviously, because the return value used at 8 could reference to `string2`, while `string2` is dropped at 7. Form the perspective of generic, `longest` function has a lifetime generic `'a` , takes an `x` with `'a`, a `y` with `'a`, and return a value with `'a`. So Rust will start generic inference based on the context:

- `string1_ref` has a lifetime `2~9`, and it could extend to `1~10`
- `&string2` has a lifetime `6~6`, and it could extend to `6~7`
- `res` is expected to have a lifetime `6~8` (Not starts from 3 because `res` at 3 is not read. The read of `res` at 8 is reading the value set at `6`).

The inference process is:

1. Set `'a` to `6~8`, because the return value requires the lifetime to be at least `6~8`. Now, `longest` takes two params with lifetime `3~8`, and return a value with `6~8`.
2. Then check the first actual param `string1_ref`. It's expected to have a lifetime `6~8`, and it's actual lifetime is `2~9`. `2~9` is subtype of `6~8`. According to covariance, it's legal.
3. Then check the second actual param `&string2`. It's expected to have a lifetime `6~8`, but it's actual lifetime is `6~6`. Rust tries to extend its lifetime, but could only reach `6~7`. `6~7` is not subtype of `6~8`, but supertype. So it's illegal, and Rust throws an error:

```
error[E0597]: `string2` does not live long enough
  --> src/bin/lifetime.rs:17:36
   |
16 |         let string2 = "myworld".to_string(); // 5
   |             ------- binding `string2` declared here
17 |         res = longest(string1_ref, &string2); // 6
   |                                    ^^^^^^^^ borrowed value does not live long enough
18 |     } // 7
   |     - `string2` dropped here while still borrowed
19 |
20 |     println!("{}", res); // 8
   |                    --- borrow later used here
```

Now the error message makes lot's of sense. `&string2` is expected to have a lifetime at least as long as `6~8`, but the max lifetime of it is `6~7`. That's why `&string2 does not live long enough`.

Let's go through the correct code with the similar process:

```rust
fn main() {
    let string1 = "hello".to_string(); // 1
    let string1_ref = &string1; // 2

    let res: &str; // 3

    { // 4
        let string2 = "myworld".to_string(); // 5
        res = longest(string1_ref, &string2); // 6
        println!("{}", res); // 7
    } // 8

    println!("{}", string1_ref); // 9
} // 10
```

1.  `'a` is set to `6~7`.
2.  Check the first actual param `string1_ref`. It has a lifetime `2~9`, and could be assigned to `6~7`.
3.  Check the second actual param `&string2`. It has a lifetime `6~6`, so Rust tries to extend it to `6~7`, successfully.

**Please attention that now the lifetime of `&string2` extends to `6~7`**, and it's simple to prove it. Rust does not allow any overlap between an immutable reference and a mutable reference to the same value. Let's add a new line above position 7:

```rust
let mut string2 = "myworld".to_string(); // 5, make it mut
res = longest(string1_ref, &string2); // 6
println!("{}", &mut string2); // add a mutable reference
println!("{}", res); // 7
```

An error arises:

```
17 |         res = longest(string1_ref, &string2); // 6
   |                                    -------- immutable borrow occurs here
18 |         println!("{}",&mut string2);
   |                       ^^^^^^^^^^^^ mutable borrow occurs here
19 |         println!("{}", res); // 7
   |                        --- immutable borrow later used here
```

It's clear that the lifetime of `&string2` is actually extended to position 7, so we cannot use `&mut string2` between position 6 and 7.

## Invariance Lifetime

Let's recall the variance table: `&'a T` is covariant in `T`, but `&'a mut T` is invariant in `T`. Let's show it:

```rust
fn test<'a>(vec: &'a Vec<&'a i32>) {
    todo!()
}

static GLOBAL_1: i32 = 1;
static GLOBAL_2: i32 = 2;
static GLOBAL_3: i32 = 3;

fn main() {
	let vec: Vec<&'static i32> = vec![&GLOBAL_1, &GLOBAL_2, &GLOBAL_3]; // 1
    test(&vec);
    println!("{:?}", vec);
    // 2
}
```

`test` accepts an immutable reference with lifetime `'a` to a vector, and the element in the vector should have the same lifetime `'a`. In `main`, we created a `Vec<&'static i32>`, then pass an immutable reference of it to `test`.

Let's clarify the inference context:

```rust
formal param: &'a  Vec<&'a      i32>
actual param: &2~2 Vec<&'static i32>
```

Generic inference always prefers the parent type, so `'a` will be inferred to `2~2`, instead of `'static`. Then, the inner `'static` is assigned to `2~2` by covariance. Compile successfully.

Then let's take a look at `mut`:

```rust
fn test<'a>(vec: &'a mut Vec<&'a i32>) {
    todo!()
}

static GLOBAL_1: i32 = 1;
static GLOBAL_2: i32 = 2;
static GLOBAL_3: i32 = 3;

fn main() {
	let mut vec: Vec<&'static i32> = vec![&GLOBAL_1, &GLOBAL_2, &GLOBAL_3]; // 1
    test(&mut vec); // 2
    println!("{:?}", vec); // 3
} // 4
```

Similarly, let's clarify the inference context:

```rust
formal param: &'a  mut Vec<&'a      i32>
actual param: &2~2 mut Vec<&'static i32>
```

`&'a mut T` is invariant in `T`, so `T` must be the certain type of what it is in actual param. `T` is `Vec<&'static i32>`, so `'a` is inferred to `'static`. Unfortunately, `&mut vec` at position 2 is never `'static`, leading to compilation error:

```
error[E0597]: `vec` does not live long enough
  --> src/bin/lifetime.rs:11:10
   |
10 |     let mut vec: Vec<&'static i32> = vec![&GLOBAL_1, &GLOBAL_2, &GLOBAL_3]; // 1
   |         -------  ----------------- type annotation requires that `vec` is borrowed for `'static`
   |         |
   |         binding `vec` declared here
11 |     test(&mut vec); // 2
   |          ^^^^^^^^ borrowed value does not live long enough
12 |     println!("{:?}", vec);
13 | }
   | - `vec` dropped here while still borrowed

error[E0502]: cannot borrow `vec` as immutable because it is also borrowed as mutable
  --> src/bin/lifetime.rs:12:22
   |
10 |     let mut vec: Vec<&'static i32> = vec![&GLOBAL_1, &GLOBAL_2, &GLOBAL_3]; // 1
   |                  ----------------- type annotation requires that `vec` is borrowed for `'static`
11 |     test(&mut vec); // 2
   |          -------- mutable borrow occurs here
12 |     println!("{:?}", vec);
   |                      ^^^ immutable borrow occurs here
```

**Rust has inferred and marked `'a` as `'static` successfully.** We could tell from the error message:

```
type annotation requires that `vec` is borrowed for `'static`
```

The inference results in the two errors:

1. `vec` does not live long enough as `'static`. It's dropped at position 4.
2. Since the `&mut vec` is static, it could last forever, so any other reference to `vec` is not allowed.

# A more complex example

```rust
struct Interface<'a> {
    manager: &'a mut Manager<'a>,
}

impl<'a> Interface<'a> {
    pub fn noop(self) {
        println!("interface consumed");
    }
}

struct Manager<'a> {
    text: &'a str,
}

struct List<'a> {
    manager: Manager<'a>,
}

impl<'a> List<'a> {
    pub fn get_interface(&'a mut self) -> Interface<'a> {
        Interface {
            manager: &mut self.manager,
        }
    }
}

fn main() {
    let mut list = List { // 1
        manager: Manager { text: "hello" },
    };

    list.get_interface().noop(); // 2

    println!("Interface should be dropped here and the borrow released"); // 3

    // this fails because inmutable/mutable borrow
    // but Interface should be already dropped here and the borrow released
    use_list(&list); // 4
}

fn use_list(list: &List) {
    println!("{}", list.manager.text);
}

```

The code will throw an error at position 4:

```
error[E0502]: cannot borrow `list` as immutable because it is also borrowed as mutable
  --> src/bin/lifetime.rs:39:14
   |
33 |     list.get_interface().noop(); // 2
   |     ---- mutable borrow occurs here
...
39 |     use_list(&list); // 4
   |              ^^^^^
   |              |
   |              immutable borrow occurs here
   |              mutable borrow later used here
```

Let's try figuring out the reason and fixing it from the perspective of variance.

1. At position 2, `list.get_interface().noop()` will create an implicit `&'b mut list<'a>` automatically, because `list.get_interface()` will be desugared to `List::get_interface(&mut list)`.
2. `list` **contains** a lifetime `'a`. Please attention, `list` contains lifetime `'a`, instead of having lifetime `'a`. Obviously `'a` is `1~4`, since `list` is used at position 1 and 4.
3. Take a look at the signature of `get_interface`: for a list which contains lifetime `'a`, the param is `&'a mut self`, which is actually `&'a mut list<'a>`.

Check the inference context:

```rust
formal param: &'a mut list<'a>
actual param: &'b mut list<1~4>
```

Since `&'a mut list<'a>` is invariant in `list<'a>`, `'a` will be assigned the value of `1~4`, and the implicit reference lifetime `'b` will be assigned the value of `1~4` as well (actually `'b` could be bigger than `1~4` due to covariance) Now, at position 4, there are both a mutable reference `&1~4 mut list<1~4>`, and an immutable reference `&list`, causing error.

Let try fixing it.

## Method 1

Although `&'a mut T` is invariant in `T`, `&'a T` is covariant in `T`. So what we need to do is just remove all `mut` and turn it into covariant, preventing the first `'a` from being assigned as the `'a` in `T` directly.

```rust
struct Interface<'a> {
    manager: &'a Manager<'a>,
}

impl<'a> Interface<'a> {
    pub fn noop(self) {
        println!("interface consumed");
    }
}

struct Manager<'a> {
    text: &'a str,
}

struct List<'a> {
    manager: Manager<'a>,
}

impl<'a> List<'a> {
    pub fn get_interface(&'a self) -> Interface<'a> {
        Interface {
            manager: &self.manager,
        }
    }
}

fn main() {
    let mut list = List { // 1
        manager: Manager { text: "hello" },
    };

    list.get_interface().noop(); // 2

    println!("Interface should be dropped here and the borrow released"); // 3

    // this fails because inmutable/mutable borrow
    // but Interface should be already dropped here and the borrow released
    use_list(&mut list); // 4
}

fn use_list(list: &mut List) {
    println!("{}", list.manager.text);
}
```

Now, `'a` will be inferred to `2~2`. For the implicit `&'b mut list<'a>` at position 2, the `'b` is `1~4`, which could be assigned to `'a` by covariance. Furthermore, we replace `&list` with `&mut list` at position 4 without error, proving that the implicit `&list` created at position 2 does not really live at position 4.

## Method 2

In method 1, we removed `mut`, resulting in the immutability of `Interface`. Now let's see how to keep `mut`.
The root cause is that `&'a mut list<'a>` is invariant in `list<'a>` and the second `'a` will be inferred to `1~4`, forcing the first `'a` to be at least `1~4`. However, it's not necessary to connect the two lifetime. So we could decouple them by introducing a new generic lifetime `'b`. The expected inference result is `'a` is `1~4` while `'b` is `2~2` so that `'b` will not affect the further references to `list<'a>`.

```rust
	pub fn get_interface<'b>(&'b mut self) -> Interface<'a>
```

But there is another error:

```
   |
19 |   impl<'a> List<'a> {
   |        -- lifetime `'a` defined here
20 |       pub fn get_interface<'b>(&'b mut self) -> Interface<'a> {
   |                            -- lifetime `'b` defined here
21 | /         Interface {
22 | |             manager: &mut self.manager,
23 | |         }
   | |_________^ method was supposed to return data with lifetime `'a` but it is returning data with lifetime `'b`
```

It's because now the lifetime is like (pseudo code):

```rust
    pub fn get_interface<'b>(self: &'b mut List<'a>) -> Interface<'a> {
        Interface {
            manager: &'b mut self.manager<'a>,
        }
    }
```

Please pay special attention, the lifetime contains in `self.manager` is different from the lifetime of `self.manager`. The former one is actually lifetime of the `&str` behind `self.manager.text`, while the latter one is of `self.manager`. The `'b` created in the function body in `&'b mut self.manager<'a>` is from the param `self: &'b mut List<'a>`.
![complex memory](https://github.com/Arichy/blogs/blob/main/docs/Rust/Variance-best-perspective-of-understanding-lifetime/imgs/complex_memory.png?raw=true?raw=true)
The compiler tells us to add `'b: 'a`, because the expected `result.manager` needs to be `&'a mut self.manager<'a>` while the actual value is `&'b mut self.manager<'a>`. According to covariance, `'b` must outlive `'a`. But we could add it, since it will extend the lifetime of the implicit `&mut list` and cause the same error as original version.
We need to decouple the lifetime at root: `Interface<'a>`. It should have two lifetime generics.

```rust
struct Interface<'b, 'a> {
    manager: &'b mut Manager<'a>,
}

impl<'b, 'a> Interface<'b, 'a> {
    pub fn noop(self) {
        println!("interface consumed");
    }
}

	pub fn get_interface<'b>(&'b mut self) -> Interface<'b, 'a>
```

Compiled successfully. Now `'b` is `2~2`, while `'a` is `1~4`. Perfect!

## contravariance

Lastly, let's have a look at contravariance quickly. It's mainly used in function type.

In TypeScript, `T` is covariant in `T`, but `(param: T)` is contravariant in `T`.

```typescript
function handleFn(callback: (items: Cat[]) => void) {
  callback([new Cat('Tom')]);
}

handleFn((items: Animal[]) => {
  items.push(new Animal('Tom'));
});
```

The param of `handleFn` is a callback function: `(items: Cat[]) => void`, but we could pass `(items: Animal[]) => void` indeed. Because when `handleFn` is called, an `items` will be passed. The data flow is from `handleFn` to `callback`. `callback` will read the `items` by formal param. `callback` must assume it as a base type instead of a super type.
But not the other way around. If `callback` expects `(items: Animal[]) => void` but it gets `(items: Cat[]) => void`, the `handleFn` may pass `Animal[]` and callback reads it as `Cat[]`, causing error.

# Summary

We've talked about variance and how to understand lifetime from the view of variance. Here are some key takeaways:

1. `&'a T` is covariant in both `'a` and `T`, which means that a subtype of `'a` (which is larger than `'a`) could be substituted for `'a`, and a subtype of `T` could be substituted for `T`.
2. `&'a mut T` is covariant in `'a`, but invariant in `T`. So if there is some lifetime `'whatever` in `T`, the `'whatever` will be inferred to the lifetime of the actual value.

# Tips

Generally speaking, never write code like

```rust
impl<'a> SomeStruct<'a> {
	fn some_method(&'a mut self) {}
}
```

Once `some_struct.some_method` is called, the lifetime `'a` of the implicit mutable reference `&'a mut self` will be tied with lifetime in `self`, and it's not allowed to use `some_struct` anymore. Because if it's used later, the lifetime in it will extend at the later position, causing the coexistence of mutable reference and any other reference in the later position.
