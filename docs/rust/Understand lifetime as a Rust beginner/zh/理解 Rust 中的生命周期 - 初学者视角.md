大部分 Rust 初学者(比如我)都会被生命周期给弄困惑. 所以写下这篇文章来记录一些困惑的点. 对于一些基本概念比如悬垂指针, 堆和栈, 所有权等, 我不会做阐述. 请确保你对这些概念有基本了解.
# 回顾
让我们先来讨论一些你已经看过无数次的内容. 众所周知, 生命周期实际上就是表示一个值所在的 scope (作用域). 当一个值离开 scope 时, 就会被清除. 你应该看过无数次以下用来解释生命周期的 demo 代码:

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

这段代码会编译失败, 因为编译器不知道 `x`, `y` 和返回值之间的关系. 所以你需要手动添加生命周期注解:

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() {
        x
    } else {
        y
    }
}
```

# 为什么编译器需要知道所谓的"关系"?
这是第一个出现在我脑海里的问题. 在其他语言例如 TypeScript 中, 我们可以很轻松地写出一版 `longest` 函数. 因为本文讨论的所有类型都是引用类型, 但是 JS 中字符串是基本类型, 不是引用类型, 所以我们用数组代替:

```typescript
function longest(a: any[], b: any[]): any[] {
	if (a.length > b.length) {
		return a;
	} else {
		return b;
	}
}
```

看上去 TS 编译器/ JS 引擎不需要知道所谓的 `x`, `y`, 返回值之间的"关系".  但是 Rust 有一套非常严格的机制, 用来确保内存安全:
> 一个值只能有一个 owner, 当这个值在离开作用域的时候, 就会被清除掉.

假设有一个函数, 它的参数是一个或者多个引用, 返回值是一个引用, **那么返回值要么来自于参数, 要么拥有静态生命周期.** 因为如果返回值引用的是在函数内创建的变量, 那么在函数执行完毕时, 这个变量所对应的值就会被销毁, 导致返回的引用类型变成悬垂指针, 指向已经被清除的内存地址.

我们暂时先忽略静态类型. 编译器之所以需要知道参数引用和返回值引用的关系, 是因为返回值必然来源于参数, 编译器需要使用 borrow checker 来检查这个引用关系是否有效.

# Borrow Checker
Rust 使用 `borrow checker` 来检查引用是否有效. 简而言之, **borrow checker 检查是否一个引用比被它引用的值活得更短.** **生命周期注解本质上的作用是帮助 borrow checker.** 它们告诉 borrow checker 一些具体的规则, borrow checker 根据这些规则去执行检查. 

另外, 在那段经典的 `longest` 函数中, 我感觉比较迷惑的点在于, `&str` 类型的值通常是拥有静态生命周期. 也就是说, 下面代码会编译/运行成功:

```rust
let str1 = "hello"; // str1 有静态生命周期
let res: &str;

{
	let str2 = "myworld"; // str2 有静态生命周期
	res = longest(str1, str2);
} // 在这里 str2 不会被销毁

println!("{}", res); // myworld
```

这可能会让人疑惑: 生命周期的作用就是为了防止这种情况的发生, 为什么这种情况反而还可以通过编译 + 正确运行呢? 其实是因为这几个 `&str` 的引用都有静态生命周期. 所以在后面我会用 `&i32` 来代替 `&str`

# 调用方视角

我们观察一下调用方的代码:

```rust
fn main() {
	let x: i32 = 13;
	let res: &i32;
	{
		let y: i32 = 6;
		res = biggest(&x, &y); // 这个函数内部会执行 res = &x ? 还是 res = &y ? 还是 res = SomeStruct { x: &x, y:&y }? 一切都未知.
	}
}
```

假设你现在是 Rust 编译器. 来, 告诉我, 你是否允许这段代码编译通过? 你无法回答, 因为你不知道 `res` 是来自于 `x`, 还是 `y`, 或者同时来自这两个, 比如返回了一个包含 `x` 和`y` 的结构体. 你的 borrow checker 不知道用什么规则去 check. 你只知道"引用不能存活超过被引用的值". 那么问题来了, `res` 是引用, 谁是被引用的值? 是 `x` 还是 `y`? 你应该检查"是否 `x` 比 `res` 活得长"? 还是检查"是否 `y` 比 `res` 活得长?" 你可能会说, 那我两个一起检查, 确保 `x` 和 `y` 都比 `res` 活得长, 就保证万无一失了. 但是如果 `biggest` 这个函数必定返回 `x` , `y` 仅仅是一条需要打印的消息呢? 这种情况下明明 `y` 不需要有任何生命周期相关的限制, 但是你硬加上了一条限制. 这太武断粗暴了.

生命周期注解的用武之地就来了:

```rust
fn biggest<'a>(x: &'a i32, y: &'a i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

现在, Rust 编译器知道, `x`, `y`, `return value` 都和生命周期 `'a` 相关. 这种"相关性"在网上有着很多种解释, 例如:

> `x` 的生命周期至少为 `'a` , `y` 的生命周期至少为 `'a` , 返回值的生命周期刚好为 `'a`.

这基本是合理的. 在我看来, 可以用一种更简单的方式去理解:
> 返回值有着生命周期 `'a`,  而 `x`和 `y` 需要同时有用不短于 `'a` 的生命周期.

这是和 Rust 编译器最接近的理解. 让我们考虑以下代码:

```rust
let x: i32 = 13;

let res: &i32;

{
	let y: i32 = 6;
	res = biggest(&x, &y);
}

println!("{}", res)
```

上述代码会编译失败并抛出错误:
> `b` does not live long enough

这是因为我们通过生命周期注解的方式告诉了编译器 `x`, `y`, `res` 的关系 :  `x` 和 `y` 需要同时比 `res` 活得长. 所以编译器会按照下面的规则来检查.
1. `x` 是不是比 `res` 活得长? 是, 他们在同一个作用域里.
2. `y` 是不是比 `res`活得长? 不是,  `res` 的实际生命周期比 `y` 更长. 拒绝编译.

# 变一下
让我们看看如果把上面的生命周期标注改一下, 会发生什么
## 变种 1
```rust
fn biggest_variant1_incorrect<'a, 'b>(x: &'a i32, y: &'b i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

**我们告诉编译器的规则:**
1. `x` 需要比 `res` 活得长(或者相等).

代码会编译失败并报错:
> error: lifetime may not live long enough
> function was supposed to return data with lifetime `'a` but it is returning data with lifetime `'b`

请注意错误信息中的 `may not`, 它表示编译器不知道`y`是否可以比 `res` 活得长 . 有可能活得更长, 也可能活得更短. 这一切是完全未知的, 因为生命周期 `'b` 和 `'a`没有任何关系 . 我们只告诉了编译器 `x` 需要比 `res`活得长, 但函数可能返回 `y`. 编译器不知道和 `y`相关的规则是什么.

因此, 我们需要告诉编译器,  `y` 也需要比 `res` 活得长:
```rust
fn biggest_variant1_correct<'a, 'b: 'a>(x: &'a i32, y: &'b i32) -> &'a i32 {
	if x > y {
		x
	} else {
		y
	}
}
```

`'b: 'a` 表示 `'b` >= `'a` . 这种语法看上去像泛型参数.  `T: Debug`表示泛型 `T` 必须拥有特征 `Debug`.

现在, 编译器知道 `'b` 比 `'a`活得长(或者相等), 成功编译.

## Variant 2
```rust
fn say_something_and_echo<'a, 'b>(x: &'a i32, y: &'b i32) -> &'a i32 {
	println!("say {}", y);

	y
}
```

**Check Rules we tell compiler:**
1. `x` 需要比 `res` 活得长(或者相等).

编译器会抛出和变种 1 同样的错误, 因为真正的返回值是 `y`, 有着生命周期 `'b`, 但是在函数签名中标注的返回值生命周期是 `'a`. 编译器不知道 `'a`  和 `'b` 的关系. 我们也需要手动加一条 `'b: 'a` 作为限制.

# 一些琐碎的东西

## JS 里同样的场景
在 JS 中试一下 Rust 中会报错的写法

```typescript
const arr1 = [1, 2, 3];
let res = [];
{
  const arr2 = [1, 2, 3, 4];
  res = longest(arr1, arr2);
} // arr2 在这里不会被销毁
console.log(res); // [1, 2, 3, 4]
```

JS 的值在离开作用域后不会被销毁, 所以 JS 不需要考虑什么生命周期之类的东西. JS 使用 `GC` 算法来管理内存. `arr2` 的值后来被 `res` 引用了, 所以这个值不会被销毁.

## 静态生命周期
拥有静态生命周期的值会随着整个 Rust 进程存活. 这也是下面代码会成功编译的原因:

```rust
let str1 = "hello"; // str1 有着静态生命周期
let res: &str;

{
	let str2 = "myworld"; // str2 有着静态生命周期
	res = longest(str1, str2);
} // 在这里, str2 不会被销毁

println!("{}", res); // myworld
```

既然它们永远存在, 为什么我们仍然需要在 `longest` 函数签名中使用生命周期注解? 这是因为 `&str` 不一定是静态的.

```rust
let string1: String = "hello".to_string();
let string1_ref: &str = &string1;

let res: &str;


{
	let string2 = "myworld".to_string();
	let string2_ref: &str = &string2;

	res = longest(&string1, &string2); // error: `string2` does not live long enough
} // string2 在这里被销毁, 所以 string2_ref 变无效了

println!("{}", res);
```

在 Rust 中, 将一个 `&String` 的值赋给 `&str` 的变量是合法的. 在上述例子中,  `string2_ref` 在离开作用域后就会因为其所引用的 `string2` 被销毁而失效.

# 总结
1. Rust 使用 borrow checker 来检查引用类型是否有效. 但是当遇到一些场景(比如一个函数接收多个引用参数, 返回引用类型), 就不知道该检查谁和谁了.
2. 生命周期注解的用途是告诉 borrow checker 检查规则, 从而使 borrow checker 知道检查谁和谁.
3. `fn function<'a>(input1: &'a type, input2: &'a type) -> &'a type` 说明了的规则是: 返回值有着生命周期 `'a`, 而且`input1` 和 `input2` 必须同时有着不短于 `'a` 的生命周期. 
4. 生命周期注解不会影响值实际的生命周期. 它们只是单纯帮助编译器, 告诉 borrow checker 检查规则.

**一句话总结, 在某些不确定的情景下, 生命周期注解告诉 borrow checker 检查规则, 从而使borrow checker 能够完成这个检查过程**

