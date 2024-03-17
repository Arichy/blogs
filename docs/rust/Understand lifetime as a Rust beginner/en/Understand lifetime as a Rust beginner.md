If you're new to Rust like me, you're pretty likely to get confused by lifetime. So I'm writing this article to record some confusing points and answers.

I'm not going to illustrate some very basic concepts such as dangling pointer, heap and stack, ownership, etcetera. Please make sure you're familiar with them.
# Retrospect
As we all know, lifetime is actually the scope of a value. When a value leaves its scope, it will get dropped. And you've seen the tutorial code lots of times:

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

It's a piece of classic demo code to illustrate lifetime. The code will fail to compile because compiler does not know the relationships between `x`, `y`, and return value. So you need to add lifetime annotations manually:

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

# Why compiler needs to know the relationships?
That's the first question in my mind. In other language like TypeScript, we can write the longest function in a very simple form. Because all types we talk about in this article are references while `string` is not a reference type in JavaScript, we use `array` instead: 

```typescript
function longest(a: any[], b: any[]): any[] {
	if (a.length > b.length) {
		return a;
	} else {
		return b;
	}
}
```

It seems that we and TS compiler/ JS engine does not need to know the `relationship`. But Rust has a very strict mechanism to ensure memory safety:
> A value only has one owner, and a value will get dropped when getting out of scope.

Considering a function which takes one or more reference arguments and returns a reference, **the returned reference can only either be from arguments, or have a static lifetime.** Because if the returned reference points to a value in the function, the value will get dropped at the end of function, which makes the returned reference a dangling pointer (points to a dropped value).

So, let's ignore static lifetime for now. The answer for why compiler needs to know the relationships between arguments (references) and return value (reference), is that the return value must come from arguments, and compiler has to check if it's valid by `borrow checker`.

# Borrow Checker
Rust uses `borrow checker` to check if the reference is valid. In short, **borrow checker checks if the reference lives shorter than the referenced value** for the sake of avoiding dangling pointers.
**Lifetime annotations are actually to assist borrow checker. They tell borrow checker the specific rules to follow and execute the check process.** And I found there is a confusing point in the ubiquitous demo code `longest`. The `&str`  values usually have a static lifetime by default. That's to say, the code below would get compiled and run successfully:

```rust
let str1 = "hello"; // str1 has a static lifetime
let res: &str;

{
	let str2 = "myworld"; // str2 has a static lifetime
	res = longest(str1, str2);
} // str2 will not be dropped here

println!("{}", res); // myworld
```

It might be a little bit confusing. So I would use `&i32` instead of `&str` to explain in the following part.

# Perspective of Function Caller

Let's observe the code at the perspective of caller:

```rust
fn main() {
	let a: i32 = 13;
	let res: &i32;
	{
		let b: i32 = 6;
		res = biggest(&a, &b); // Would it be res = &a ? or res = &b ? or res = SomeStruct { a: &a, b:&b }? It's unclear.
	}
}
```

Imagine you're the Rust compiler. Now, please tell me, do you allow the compilation? **You cannot make the decision because you don't know the `res` is from `a`, or from `b`, or both** (in a struct type containing both `a` and `b` ). **Your borrow checker does not know what rules to follow and check.** Should I check if `res`  outlives `'a` ? Or should I check if `res` outlives `b` ? Certainly you cannot just check both `a` and `b` because it's too arbitrary.

That's why we need lifetime annotations.

```rust
fn biggest<'a>(x: &'a i32, y: &'a i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

Now, Rust compiler knows that `x` , `y`, `return value` are all related to lifetime `'a` . There are many explanations about the word `related` like:

> `x` has a lifetime more than `'a` , `y` has a lifetime more than `'a` , while return value has a lifetime which is exactly `'a`.

That makes sense. And IMO we can memorize it in a simple way:
> return value has a lifetime `'a`, while `x`  and `y` should both have a lifetime longer than `'a`.

That's what I think the most close explanation to how Rust compiler thinks. Let's consider the following code:
```rust
let x: i32 = 13;

let res: &i32;

{
	let y: i32 = 6;
	res = biggest(&x, &y);
}

println!("{}", res)
```

It would fail to compile and compiler would throw the error:
> `b` does not live long enough

It's because we tell compiler the relationships between `x`, `y`, and `res` by lifetime: both `x` and `y` should outlive `res`. So compiler would check as the rule.
1. If `x` outlives `res`? Yes, they have the same scope.
2. If `y` outlives `res`? No, lifetime of `res` is longer than `y`. Refuse to compile.

# Variants
Let's see what will happen if we try some other lifetime annotations and return value.
## Variant 1
```rust
fn biggest_variant1_incorrect<'a, 'b>(x: &'a i32, y: &'b i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

**Check Rules we tell compiler:**
1. `x` should outlive `res`.

The code would fail to compile with an error message:
> error: lifetime may not live long enough
> function was supposed to return data with lifetime `'a` but it is returning data with lifetime `'b`

Please pay attention to the word `may not`. It means the compiler does not know if `y` could outlive `res` . It may be, or it may not be. It's unclear because lifetime `'b` has nothing to do with `'a` . We only tell compiler `x` should outlive `res`, but we may return `y`. Compiler does not know the rule about `y`.

Since we need to tell compiler that `y` must outlive `res`:
```rust
fn biggest_variant1_correct<'a, 'b: 'a>(x: &'a i32, y: &'b i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

`'b: 'a` means `'b` outlives `'a` . It looks like the generics. If you say `T: Debug`, it means generic `T` must has the trait `Debug`.

Now compiler knows that `'b` outlives `'a` and compile it successfully.

## Variant 2
```rust
fn say_something_and_echo<'a, 'b>(x: &'a i32, y: &'b i32) -> &'a i32 {
	println!("say {}", y);

	y
}
```

**Check Rules we tell compiler:**
1. `x` should outlive `res`.

The compiler would throw the same error as variant 1, because compiler does not know the rules between real return value `y` with lifetime `'b` and `'a`. We need to add `'b: 'a` as well.

# Trifles

## The same scenario in JS
Let's take a look at the JS code which fails to compile in Rust:

```typescript
const arr1 = [1, 2, 3];
let res = [];
{
  const arr2 = [1, 2, 3, 4];
  res = longest(arr1, arr2);
} // arr2 does not get dropped
console.log(res); // [1, 2, 3, 4]
```

JS value will not be freed or dropped after leaving its scope. It's a rule just in Rust. So JS does not need to consider about whatever lifetimes. It uses `GC` to manage memory. `arr2` is referenced by `res`, so it will not be dropped.

## Static lifetime
Values with a static lifetime will survive along with the process. That's why the code would compile successfully:

```rust
let str1 = "hello"; // str1 has a static lifetime
let res: &str;

{
	let str2 = "myworld"; // str2 has a static lifetime
	res = longest(str1, str2);
} // str2 will not be dropped here

println!("{}", res); // myworld
```

Since they live all the time, why we still need lifetime annotations in `longest`? It's because `&str` is not always static.

```rust
let string1: String = "hello".to_string();
let string1_ref: &str = &string1;

let res: &str;


{
	let string2 = "myworld".to_string();
	let string2_ref: &str = &string2;

	res = longest(&string1, &string2); // error: `string2` does not live long enough
} // string2 gets dropped here, so string2_ref is invalid

println!("{}", res);
```

In Rust, you can assign a `&String` to `&str` like we do above (remember `longest` takes two `&str` arguments). In the above case, `string2_ref` will be invalid after getting out of scope.

# Summary
1. Rust uses borrow checker to check if references are valid. But when it meets a function which takes references as input and reference as output, it does not know the rules to check.
2. The purpose of lifetime annotations are to tell borrow checker the rules to follow, so that borrow checker would know what values to check and how to check them.
3. `fn function<'a>(input1: &'a type, input2: &'a type) -> &'a type` specifies the rule: return value has a lifetime `'a`, while both `input1` and `input2` must have a lifetime longer than (or equal as) `'a`. 
4. Lifetime annotations will not affect the real lifetime of values. They just help compiler.

**In a word, lifetime annotations tell borrow checker the rules to check in some unclear situations, while borrow checker perform the actual checking process**
