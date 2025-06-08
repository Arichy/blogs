本文适用于有 前端/JS/TS 背景的开发者, 介绍一些学习 Rust 的过程中会遇到的疑惑, 区别, 新概念等.

JS 由于其高度动态灵活的脚本语言特性, 使得我们在写代码时能够最大程度地放飞自我, 随心所欲, 脑子一扔就是写. (你写 JS 时会考虑内存安全和并发安全吗? 反正我基本不会)

1. 自带 gc, 所以不需要考虑内存管理, 直接让对象的引用飞来飞去
2. 动态类型, 所以在变量赋值/修改时不需要考虑类型
3. 大量使用引用类型, 所以不需要考虑内存布局, 不需要区分 stack/heap
4. 流行的 Runtime 基本都是单线程 + 自带 event loop, 所以几乎所有的并发问题都不存在了

但是在 Rust 的世界里, 上面所有的细节都需要开发者铭记于心, 时刻牢记. 这也导致 JS / Python, 甚至 Java / Go 开发者在学习 Rust 时会产生不适感, 需要从自己的舒适区走出来很远很远. 再也没有任何运行时帮助我们封装和处理大量的底层细节, 唯有编译器和我们斗智斗勇反复纠缠.

# 0. 发音

Rust 有着自己独特的命名规则, 有些和其他主流语言惯例不太符合. 比如 `interface` 这个概念, 在 Rust 里叫 `trait`. JS 里的 `package` 在 Rust 里类似的叫 `crate`. 同时 Rust 的设计哲学是尽可能减少源代码字符, 所以函数定义用 `fn`, 不是 Go 的 `func`, 不是 JS 的 `function`; 可变性用 `mut`, 不是完整的 `mutable`; 实现 trait 用 `impl`, 而不是完整的 `implement`; 字符串又包含 `str` 和 `String` 两种类型. 所以最开始的时候我们介绍一下 Rust 社区里主流的发音.

## 关键字/语法元素

| 符号/单词 | 发音                            | 类别         | 说明                               |
| --------- | ------------------------------- | ------------ | ---------------------------------- |
| `str`     | /stɜr/（像 “stir”）             | 类型         | 是 `&str` 中的 `str`，不是 “S-T-R” |
| `impl`    | /ɪmpl/（像 “imp-l”）            | 关键字       | implement 的缩写                   |
| `dyn`     | /dɪn/ 或 /daɪn/（两种都有人用） | trait 关键字 | dynamic 的缩写                     |
| `crate`   | /kreɪt/（像 “create” 去掉 e）   | 模块系统     | Rust 中的包或模块单元              |
| `trait`   | /treɪt/                         | 接口         |                                    |
| `enum`    | /ˈiːnəm/ 或 /ˈɛnəm/             | 枚举类型     |                                    |
| `mod`     | /mɑd/（像“mod”ify）             | module       | module 的缩写                      |
| `mut`     | /mjut/（像 mute）               | 可变性       | mutable 的缩写                     |
| `fn`      | /ɛf ɛn/（F-N）                  | function     | 声明函数                           |

## 类型/结构

| 名称  | 发音                               | 含义                       |
| ----- | ---------------------------------- | -------------------------- |
| `Vec` | /vɛk/（像“vac”）或直接拼字母 V-E-C | 向量类型（vector）         |
| `Rc`  | /ɑr si/（R-C）                     | Reference Counted 智能指针 |
| `Arc` | /ɑrk/（像“ark”）                   | Atomic Reference Counted   |

# 1. 基础内容: mut

对于大部分语言背景的开发者来说, `mut` 是一个很新鲜并且莫名其妙的设计. 我们在写 JS 时从来不会考虑一个变量是不是可变的, 默认所有变量都是可变的. 即使是用 `const` 定义的变量 `some_obj`, 也仅仅是 `some_obj` 自己不能被赋给一个其他的值, 但是 `some_obj` 引用的对象自己是可以任意修改的, 比如新增/删除/修改字段.

但是 Rust 要求使用 `mut` 来显示声明一个变量是可变的, 并且这个可变性限制整个 object tree. 如果一个结构体变量没有 `mut`, 那么这个结构体的字段也不可以修改. 这么做有以下几个原因:

1. Rust 的一个设计哲学是尽可能显示声明. 比如用 `mut` 显示声明一个变量是可变的, 那么没有用 `mut` 的变量就是不可变的, 当你看到这样的变量时, 在后续任何地方都不用担心它的值发生了变化, 减少了心智负担.
2. Rust 的 Borrow Checker 有一条规则: **对于同一个值 T, 不能同时存在可变引用 &T 和不可变引用 &mut T**, 所以需要区分是否可变.

# 2. 进阶内容: hello world

是的, 你没有看错, 打印 hello world 在 Rust 里就是进阶内容.

在其他语言的学习过程中, 我们几乎一定以打印 "hello world" 为起点. 例如:

```rust
// Popular JavaScript Runtime
console.log("hello world");

// Go
fmt.Println("hello world");

// Java
System.out.println("hello world");
```

通过一行语句, 我们起码可以学到在这个语言里的两件事:

1. 如何声明字符串
2. 如何打印东西

好的, 接下来我们看看 Rust 的 hello world

```rust
println!("hello world");
```

看上去很简单, 但其中藏有至少四个微妙但重要的概念: 字符串, 生命周期, fat pointer, macro.

## 2.1. 字符串

如果你将 "hello world" 抽离为一个变量, 在安装了 rust-analyzer (Rust 的 language server,后文简称 ra) 的编辑器中, 会提示你变量类型:

```rust
fn main() {
  let hello_world: &'static str = "hello world";
}
```

变量类型为 `&'static str`, 这一下子就容易让人晕了. 这个类型的完整准确中文翻译是`生命周期为静态的字符串切片引用`, 我们一个个解释. 首先这是一个引用类型, 本质上就是一个指针, 指向一个类型 `str`. `str` 的中文翻译是 `字符串切片`, 它是**一种**字符串类型. 是的, Rust 里许多种字符串类型. 生命周期为静态的意思是, 在程序执行期间, 这个引用指向的 `str` 值永远不会被销毁, 会永远存活.

上面代码被编译后的二进制产物里(以 Linux 的 elf 文件为例), "hello world" 这个字符串会存在某个 PT_LOAD segment 中 (处于硬盘里). 操作系统在加载这个二进制产物准备执行时, 会把这个字符串加载到 .rodata section 中 (处于内存中), 然后在 main 函数的 stack frame 里分配一个指针, 即 `hello_world` 变量, 指向这个类型为 `str` 的字符串 "hello world".

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

由于这个 "hello world" 位于 .rodata section 里, 它会在程序运行期间永久存活, 所以指向它的引用 `hello_world` 生命周期为 `'static`. 在 Rust 的语句里, 生命周期可以被隐藏. 所以很多情况下, 我们看到的都是 `&str` 这个类型, 即`字符串切片引用`, 简称`字符串引用`.

为什么需要用 `&str` 一个引用类型, 而不是直接用 `str` 类型呢? 是因为 Rust 要求每个变量的大小在编译时必须已知. Rust 默认把局部变量都分配在 stack 上, stack 在分配的时候需要具体大小, 所以需要知道一个 stack frame 里每个变量的大小. 而 `str` 类型的大小是不确定的, 因为你不可能在编译器知道任意一个 `str` 类型字符串的大小. 上述的 `&str` 因为指向的是静态的 "hello world" 字符串, 所以可以知道, 但是 `&str` 也可以指向动态的字符串, 这个字符串的大小可以在运行时随意修改, 所以 `str` 的大小就不可能在编译时确定了, 所以我们只能用 `&str` 这个引用类, 因为一个引用类型的大小是可以确定的.

从图上内存布局中可以看出, `&str` 并不单纯是一个指针, 它还包含了一个长度字段 `len`, 用来表示指向的 `str` 的长度. 在 C 语言里, 字符串以特殊字符 `\0` 结尾, 所以不需要知道长度, 但是 Rust 的机制是没有 `\0`, 所以需要一个长度字段. 这种携带了额外字段的指针类型就叫胖指针, `fat pointer`. 所以 `&str` 的长度是固定的 2 个 `usize.` `usize` 是一个整数类型, 和平台相关, 为当前平台的一个指针大小. 在 MacBook with Apple Silicon 系列中, 这个大小为 64 bits, 也就是 8 bytes. 所以一个 `&str` 就是 16 bytes.

终于介绍完了 `str` 和 `&str`, 接下来我们介绍 `String`. `String` 是一个会分配到 heap 上的类型, 因为它本质上就是一个 `Vec<u8>`, 而 `Vec` 会分配到 heap 上.

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

先忽略 `hello_string` 的 `len` 和 `capacity`, 这个后面我们在介绍 `Vec` 时会再讲. `String` 类型的变量会在 heap 里分配一段内存来存储字符串, 然后在 stack 上用一个指针指向它. 因为 `String` 的底层数据是在 heap 上分配的, 所以天然长度可变. 当我们需要可变字符串时, 就需要用到 `String`.

```rust
// 创建 String 的几种常见方式, 其中 1 和 2 最常用
let s = "hello".to_string(); // 调用 &str 的 to_string 方法
let s = String::from("hello"); // 调用 String 实现的 From<&str> trait 的 from 方法
let s: String = "hello".into(); // 因为 String 实现了 From<&str>, 所以 &str 会自动实现 Into<String>. 但是由于 &str 实现了多个 Into trait, 所以需要显示声明 s 的类型
let s = "hello".to_owned(); // 调用 str 实现的 ToOwned trait 里的 to_owned 方法
let s = String::new(); // 创建一个空字符串
let s = String::default(); // 调用 String 实现的 Default trait 的 default 方法, 创建一个空字符串

// 修改 String
let mut s = "hello".to_string(); // s: "hello"
s.push_str(" world"); // s: "hello world"
```

`&str` 和 `String` 是 Rust 里最常用的两个字符串类型, 但是 Rust 还提供了一些其他的字符串类型: `PathBuf` vs `Path`, `OsString` vs `OsStr` 等. 这些本质上和 `String` vs `&str` 没啥区别, 只是用于一些特定领域. 比如 `Path` 是对 `OsStr` 的一个封装, `OsStr` 是对 `[u8]` 的一个封装, 但是专门用于路径领域, 比如读取文件相关的函数的参数, 所以会增加一些特有的方法, 比如 `is_dir`, `is_absolute` 等.

这也是 Rust 的一个设计哲学: 本质上是同一个类型的值, 在不同的场景下, 会被封装成不同的类型. 一个很经典的例子是时间点和时间长度.

在 JS 里, 我们用 number 来表示时间戳, 也就是一个时间点. 我们也用 number 来表示一段时间长度:

```typescript
// 表示 1000ms 后的一个时间戳

const now: number = Date.now();
const duration_ms: number = 1000;
const then: number = now + duration_ms;
```

这样带来的问题是, 当我拿到一个类型为 number 的变量时, 我很难去判断这个变量到底是什么. 有可能是时间点, 有可能是时间段, 还有可能是年龄, 质量, 物理攻击, 法术穿透.

而 Rust 下, 虽然本质上都是整数性质的数据, 但是在不同的场景下, 会被包装为不同的类型:

```rust
let now: Instant = Instant::now(); // 请注意 Instant::now 返回的不是当前时间
let duration_ms: Duration = Duration::from_millis(1000);
let then: Instant = now + duration_ms;
```

这样当我调用 `thread::sleep` 这种应该接收时间段 `Duration` 的函数时, 就不会传时间点类型 `Instant` 或者其他整数类型进去.

FYI, JS 新的时间模块 [Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal) 也引入了 `Duration` 和 `Instant` 的区分.

## 2.2 Macro

你一定会很好奇, 为什么有些"函数调用"后面有感叹号, 有些没有. 比如 `"hello".to_string()` 没有感叹号, 但是 `println!()`, `write!()` 有. 其实是因为这里的 `println`, `write` 并不是函数, 而是 declarative macro.

declarative macro 是一种 macro, 会用类似正则匹配的机制去匹配内部的代码, 然后将其转换为另一套代码. 由于 `println` 最终转换的代码比较特殊, 是编译器特殊处理的代码, 我们用 `vec!`, 一个用于初始化任意数量元素的 vector 的 declarative macro, 来举例子

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
            $crate::boxed::box_new([$($x),+])
        )
    );
}
```

一个 declarative macro 会定义多个分支, 每个分支代表一个匹配. 在编译开始时, 会执行匹配, 匹配到某一个分支时, 就会用分支对应的代码去替换掉原有代码. 比如

```rust
let vec = vec![1, 2, 3];
// 会被替换为
let vec = <[_]>::into_vec(#[rustc_box] ::alloc::boxed::Box::new([1, 2, 3]));
```

由于 declarative macro 比较复杂, 这里不多赘述, 只需要知道是在编译开始时展开替换原有代码即可. 那么问题来了, 为什么 `println!`, `vec!` 需要设计成 macro, 而不是直接提供一个 `println` 和 `vec` 函数呢? 因为 Rust 一个函数的参数数量必须固定. Rust 也不支持函数重载. 但是对于 `println!` 来说, 里面的参数数量是不固定的, 取决于里面模板字符串有多少个需要插入替换的 slot. 同理, `vec!` 接收的初始化元素数量也不可能固定. 所以这两个被设计为了 macro, 在编译开始时展开为调用另一个参数固定的函数.

Rust 的 macro 分为以下几类

- declarative macros
- procedural marcos
  - function-like macros
  - derive macros
  - attribute macros

这里只简单介绍 procedural macros, 不深入了解. 三种 procedural macros 本质上都是一个函数, 接收的参数是 `TokenStream`, 代表输入的一段 Rust 代码. 返回值也是一个 `TokenStream`, 代表输出的一段 Rust 代码. 在编译开始时, 会执行这个函数, 然后生成返回值对应的 Rust 代码.

declarative macros 执行的是一个匹配, 所以名为 declarative, 声明式. 我声明几个分支, 你匹配上了, 我就执行替换. 而 procedural marcos 执行的是一个函数, 所以名为 procedural. 新手很容易陷入一个误区, 看到 `println!("hello")` 这种长得像函数调用的 macro, 就以为是 function-like macros. 其实这不对, declarative 和 procedural 是根据其操作输入代码的方式来区分的.

FYI, 可以用 `cargo install expand` 来装 [cargo-expand](https://github.com/dtolnay/cargo-expand) 这个工具, 装好之后就可以通过 `cargo expand` 命令来查看部分 macro 展开后的结果.

# 3. Array vs Vec

在 JS 里, 数组 Array 是我们用得最多的数据结构, 可能没有之一. 我们早已熟悉数组里的各种操作, 包括创建, 任意位置插入/删除元素等. 但是很可惜, Rust 中的数组类型为 `[T; N]`, 其中 `T` 是元素类型, `N` 是元素个数, 而**元素个数必须在编译时确定**. 这就相当难受了, 数组长度必须在编译时也就是写代码的时候就确定, 灵活性基本没有了, 这也导致数组类型的用途就很局限了, 甚至一个最基本的遍历打印的函数参数都不能是数组.

所以 Rust 里用得更多的是 `Vec` 向量结构体, 也是 `String` 类型的底层数据. `Vec` 就类似 JS 里的 `Array` 了, 长度可变, 随便怎么玩都行. 在 `String` 的内存布局图里, 我们看到了 `Vec` 由三部分组成:

- `ptr`: 指向 heap 里真实数据的指针, 会指向 vec 里的第一个元素
- `len`: vec 当前的长度, 也就是当前元素数量
- `capacity`: vec 当前的容量

前两个都比较容易理解, 就是这个 `capacity` 有点令人费解. 简单来说, `capacity` 是当前 vec 能容纳的最大元素个数, `capacity` 一定 \>= `len`. 当 `capacity == len` 时, vec 就填满了. 此时如果再执行 `vec.push` 之类的方法插入元素, vec 就会先扩容, 也就是新分配一段 `capacity` 更大的内存 (一般来说是当前 `capacity` \* 2), 然后将自己现有的所有元素移动到新的位置, 然后再插入元素. 当然, 这个扩容有可能原地发生, 也就是说新分配的内存起点和当前内存起点一样, 此时所有元素就不需要移动. 所以严格来说, `push` 方法的时间复杂度并不一定为 `O(1)`, 在扩容发生时有可能为 `O(n)`.

到这里, 我们可以解释 `对于同一个值 T, 不能同时存在可变引用 &T 和不可变引用 &mut T` 这条规则存在的原因了. 考虑以下代码:

```rust
let mut v = vec![1, 2, 3, 4];// 1

let v_shared_ref = &v; // 2. 先获取一个 shared reference (immutable reference)
v.push(5); // 3. 再获取一个 mutable reference, push 方法会自动创建一个 mutable reference

println!("{:?}", *v_shared_ref); // ❌ 4. 使用 2 中创建的 shared reference
```

在 3 处, 一个不可变引用和一个可变引用同时存在了, 违反了规则, 导致的结果就是 3 中可能因为 vec 扩容, 整个 vec 被移动到了新分配的地址上, 而原来的 `v_shared_ref` 仍然指向旧的地址, 变为 dangling pointer, 在 4 中解引用发生 undefined behavior. 此时内存安全就被破坏了.

# 4. Enum and Pattern Matching

`enum` 在 TS 里是一个不太好的设计, [有许多问题](https://www.google.com/search?q=don%27t+use+enum+in+typescript), 在实际开发中用得也不多, 所以也不受重视.

但是在 Rust 里, enum 是一个极其重要的结构. 原因很简单, **Rust 没有联合类型**, Rust 只有单一类型. 所以 Rust 只能用 enum 来实现联合类型的效果. 并且 Rust 的 enum 比其他语言的强大许多, 因为支持包裹类型, 配合 Rust 自己的 `pattern matching` 语言特性.

假如现在要实现一个 `printAdd1` 函数, 参数可以是字符串或者数字. 如果是字符串, 就打印 字符串+"1" 的结果. 如果是数字, 就打印 数字+1 的结果. 在 TS 里我们会这么写:

```typescript
function printAdd1(val: string | number) {
  if (typeof val === 'string') {
    console.log(`${val}1`);
  } else {
    console.log(val + 1);
  }
}
```

但是在 Rust 里就需要用 enum 了

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

enum 在 Rust 中无处不在.

## 4.1. 可能为空的值: Option\<T\>

Rust 中没有 `null`, 所以如果要表达一个可能有值也可能为空的变量 T, 就需要一个 enum: `Option<T>`.

比如实现一个除法函数, 在 TS 里我们会这样:

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

在 Rust 里我们需要:

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
  Some(result) => {
    // handle result
  }

  None => {
    // handle null
  }
}
```

## 4.2. 错误处理: Result\<T, E\>

上面的 `divide` 函数, 我们也可以用 `Result<T, E>` 来作为返回值.

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
    Ok(result) => {
        // handle result
    }

    Err(reason) => {
        // handle error
    }
}
```

`E` 本身没有限制, 可以为任意类型. 但是一般 `E` 都会是一个实现了 `Error` trait 的类型.

## 4.3. unwrap

如果你觉得 `Option` 和 `Result` 太繁琐了, 我只是想单纯地读个文件内容, 还要写一堆 `match` 来处理结果, 那么 `unwrap` 会让你回到舒适区一段时间.

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

`unwrap` 是 `Option` 和 `Result` 都有的一个方法.

- 对于 `Option<T>`, 返回其 `Some(T)` 包裹的 `T`. 如果为 `None` 就会 `panic`.
- 对于 `Result<T, E>`, 返回其 `Ok(T)` 包裹的 `T`. 如果为 `Err(E)`, 就会 `panic`.

在正式的生产环境, `unwrap` 只有在完全确定不会有问题的情况下才能使用, 简化代码.

# 5. Trait

Rust 的另一个设计特点是不符合惯例的命名规则. 在其他语言里, 这个概念几乎都叫 `interface`, 但是 Rust 命名为 `trait`. 两者概念基本接近, 但是 trait 更加强大, 甚至可以说是整个 Rust 程序结构或者生态的基石. 在任何时候, 我们都需要围绕 trait 去思考问题, 这也是 JS 开发者会感到不适应的很大一个点. 在 JS 里, 当我们使用第三方库时, 我们基本只会关注其提供的函数/class/object, 然后直接调用已有的方法就好了. 但是在 Rust 里, 我们还需要关注 trait. 在使用第三方 crate 时, 很多时候甚至都只会使用 trait, 让我们自己的结构体实现其提供的 trait, 然后使用里面的功能.

如今编程界的一个趋势是减少面向对象编程. Go/Rust 等新生语言几乎完全抛弃了 OOP, 不再有 class, object, extends 等概念; JS 里虽然通过原型模拟了 class, 但是社区目前的趋势也是在抛弃 OOP, 典型的 React 用 function component + hooks 的函数式编程 + 组合代替继承的思维, 抛弃了 class component.

Rust 的 trait 就是组合代替继承最好的体现. 对于一个结构体而言, 我们不会通过思考它的继承关系来判断它有哪些方法, 而是通过思考它实现了哪些 trait. 我们的思维应该包含:

- 我的结构体需要实现某些方法, 那么这些方法很可能已经被定义在了一个标准库已有的 trait, 所以我需要让我的结构体实现这个 trait
- 我的函数可能需要有能力操作多个类型, 但是这些类型肯定需要满足相同的某些条件, 所以我需要限制函数的泛型参数满足某个/某几个 trait

在 Rust 里一切都是围绕 trait 来实现的. 比如最基本的打印输出, 在 JS 里我们可以用 `console.log` 打印任何东西, 但是在 Rust 里不可以. 因为在 JS 里, 有很多东西是我们没有思考的, 比如这个要打印的东西是否可序列化, 以什么样的形式序列化. 这些问题 JS runtime 帮我们解决了. 但是 Rust 不会帮我们解决, 需要我们自己思考.

```rust
println!("{}", some_variable);
println!("{:?}", some_variable);
```

上面两种方式都可以打印 `some_variable`. 第一种方式里, 要求 `some_variable` 实现 `std::fmt::Display` trait, 第二种方式要求实现 `std::fmt::Debug` trait. 它们的区别在于, `Display` 一般是给人看的一个可阅读的格式, `Debug` 是给程序员看的便于调试的格式. 比如打印一个字符串, `Display` 只会打印字符串自身, 而 `Debug` 会额外打印出两边的双引号.

```rust
struct Coordinate {
  x: i32,
  y: i32,
}

let c = Coordinate {
  x: 1,
  y: 2,
};

println!("{}", c);
println!("{:?}", c);
```

上面的两个打印语句都会报错, 因为 `Coordinate` 既没有实现 `Display` 也没有实现 `Debug`. 一般情况下我们都会通过 `#[derive(Debug)]` 来让自定义结构体自动实现 `Debug`, 便于开发时调试. 自动实现 `Debug` 的前提是, 结构体内部的所有字段必须都已经实现了 `Debug`. 比如 `Coordinate` 的 `x` 和 `y` 都是 `i32`, 都已经实现了 `Debug`, 所以可以 derive Debug. 但是 `Display` 不能被自动实现, 如果需要的话只能手动实现.

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

从结果也可以看出, `Display` 打印的是给人类看的, `Debug` 打印的是给程序员看的.

# 6. 闭包 vs 函数

闭包是 JS 里一个不是很被重视的概念. 我们定义函数的时候, 也很少去思考它是不是一个闭包. 闭包这个词在 JS 社区里出现得也不多. 但是在 Rust 里, 闭包是一个非常重要, 需要单独记忆的概念.

简单来说, 闭包本质上是一个捕获了外部变量的**结构体**, 并不是一个函数. 在 Rust 里一切变量都是需要清楚地确定存放位置的, 所谓的"捕获的变量"也需要存放在某个位置上, 所以闭包会被编译为一个结构体, 将捕获的变量存放在结构体内.

```rust
let to_add = 1;
let f = |i: i32| {
    let tmp = 0;
    tmp + i + to_add
};

let result = f(42);
```

上述代码会被编译为类似以下代码:

```rust
struct F_Closure{
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

Rust 的闭包是一个实现了 `FnOnce/FnMut/Fn` trait 的结构体, 捕获的变量会保存在结构体里, 调用的时候会调用对应的 `call_once/call_mut/call` 方法.

- `FnOnce`: 接收 `self`, 调用会消耗 `self`, 所以只能调用一次
- `FnMut`: 接收 `&mut self`, 调用允许修改结构体, 也就是捕获的变量, 可以多次调用
- `Fn`: 接收 `&self`, 调用不允许修改结构体, 可以多次调用

这三个 trait 的关系是: `Fn: FnMute: FnOnce`, 按照函数体内部限制从最大到最小的顺序. `Fn` 限制最大, 只能访问不可变引用. `FnOnce` 限制最小, 随便怎么访问都行.

重点来了, Rust 的闭包是复杂类型, 所以 ra 会告诉你 `f` 的类型是 `impl Fn(i32) -> i32`, 说明 `f` 是一个实现了 `Fn` 的结构体, 但是具体的名字不知道. 因为 Rust 会给每一个闭包生成一个单独的结构体, 所以不可能有两个闭包类型相同, 即使它们的参数列表, 函数内部实现, 返回值一模一样.

## 6.1. 按引用捕获 vs 按所有权捕获

Rust 可以捕获外部变量的引用, 也可以捕获外部变量的所有权.

```rust
let mut s = "hello".to_string();
let f = || {
    let b = s;
    b.push_str(" world");
};

println!("{s}"); //  ❌ s 已经被移动到了 f 内部
```

上面 `f` 实现的就是 `FnOnce`, 因为在定义 `f` 时, `s` 被移动到了 `f` 结构体里, 在调用时会被移动到函数体里给了 `b`, 而 `b` 是一个函数内的变量, 调用完会被销毁, 所以这个函数只能调用一次, 消耗掉整个结构体.

```rust
let mut s = "hello".to_string();
let mut f = || {
    s.push_str(" world");
};

println!("{s}"); // ✅ s 没有被移动给 f, 所以这里依然可以访问
```

上面 `f` 内虽然使用了 `s`, 但是因为 `push_str` 只需要 `&mut String`, 所以只捕获了 `&mut s`, `s` 在后续依然可访问.

```rust
let mut s = "hello".to_string();
let mut f = move || {
    s.push_str("world");
};

f();
println!("{s}"); // ❌ s 已经被移动到了 f 内部
```

通过 `move` keyword, 我们告诉编译器, f 会捕获 `s` 的所有权, 所以 `s` 会被移动到 `f` 结构体里, 后续不可访问.

在并发编程中几乎都会用到 `move`. 举个例子, 当使用 `thread::spawn` 创建一个线程时, 就必须使用 `move` 将捕获的外部变量全部移动到闭包里, 传递给新的线程, 因为两个线程执行顺序和时间是完全不确定的. 主线程可能在新线程完成之前就完成了, 从而销毁掉自己栈上的变量.

对于使用 `fn` 定义的普通函数, 它们有具体的类型: `fn(i32) -> i32`, 所以多个函数可能是同一个类型, 并且所有的普通函数都实现了 `FnOnce` + `FnMut` + `Fn`. 换句话说, 所有的普通函数都可以当做闭包使用.

# 7. 多线程和异步

由于多线程和异步本身难度非常大, 本文不会过多描述, 只会介绍一些最基本的概念.

- 多线程: 通过 `thread` 里的方法启动多个线程
- 异步: 类似于 JS 的 async/await

## 7.1. 多线程

适用于计算密集型任务, 可以并行处理. 这一个点往往是 JS 开发者的盲区, 因为流行的 JS runtime 都是只对开发者提供单线程, 没有能力实现真正的并行.

## 7.2. 异步

适用于 IO 密集型任务, 可以并发处理. JS 开发者初次接触 Rust 的 async/await 时, 会感到熟悉又陌生. 熟悉的点是语法基本一样, 都是通过 async 定义一个异步函数, 然后通过 await 来等待一个异步函数返回, 只是 JS 里 await 放在异步调用前面, Rust 放在后面. 然而陌生的点就比较匪夷所思了:

1. main 函数不能是 async. 在 JS 里由于 async/await 的传染性, 如果 main 函数不能是 async, 那我里面所有的 await 调用怎么办?
2. 我翻遍了整个标准库也没有找到一个 async fn. 不管是读文件还是网络请求, 一个 async fn 都没有. 我熟悉的 `const content = await readFile("xxx")` 好像没法写了.

这又要说回 Rust 的设计哲学了. Rust 标准库没有提供任何异步的实现, 也没有提供任何异步 runtime, 都交给了社区里的第三方实现. Rust 官方只提供了 async/await 的语法糖, 只在编译层面将其编译为同步代码 (以 `Future` trait 为核心), 但是具体怎么执行这些 futures, Rust 官方不管, 需要自己提供一个 runtime 来调度.

目前事实上的 async runtime 标准是 [tokio](https://tokio.rs/), 初学者直接无脑使用 tokio 即可.

```rust
use tokio::fs::read_to_string;

#[tokio::main]
async fn main() {
    let content = read_to_string("/path/to/file").await;
    match content {
        Ok(content) => {
            // handle content string
        }
        Err(err) => {
            // handle error
        }
    }
}
```

tokio 会提供一个完整的异步生态, 包括 scheduler, event loop (IO, timers, etc), 异步方法 (fs, net, channel, etc) 等功能. 此时你应该又有了这个感觉, 我们之所以写 JS 写得这么爽, 是因为这些内容都被底层的 runtime 提供了. 比如 JS 里的 macro/micro task, 其实就是 tokio 里的 scheduler. Node.js 的 event loop, 其实 tokio 里也有对应的实现.

## 8. 忘掉面向对象

**Rust 不是一个面向对象的语言**, 所以在学习的时候最好抛弃掉面向对象的思维 (当然, 其实 JS 严格来说也不是面向对象的语言, 因为没有 class). Rust 没有类和继承, 但是借鉴了 OOP 里的一些特性, 比如用 struct + impl + pub 可见性控制实现了封装, 通过多种方式实现了多态.

### 8.1. 方法调用的本质

Rust 里其实没有方法, 所有的方法都是普通的函数.

```rust
let mut nums = vec![1, 2, 3];

nums.push(4);
// 本质上是
Vec::push(&mut nums, 4);
```

所有的方法调用本质上都是根据方法的 self 类型 (self, &self, &mut self) 来创建一个引用(或者直接把自己)传给函数, 然后再传剩余参数. 这一点在和生命周期搏斗时很有帮助, 显式写出一个 `&mut xx` 会更明显看到在这里创建了一个 mutable reference, 然后去推理生命周期.

### 8.2. 泛型实现参数多态

参数多态指的是一个函数可以对不同的类型做出相同的处理. Rust 使用的泛型来实现参数多态, 在编译时会对泛型函数做**单态化**. 单态化的意思就是, 会对每一个调用这个函数的类型, 生成一个这个类型对应的唯一的函数.

```rust
fn get_first<T>(slice: &[T]) -> &T {
    &slice[0]
}

let nums = vec![1, 2, 3];
let strings = vec!["1".to_string(), "2".to_string(), "3".to_string()];

let first_num = get_first(&nums);
let first_string = get_first(&strings);
```

上面代码会将 `get_first` 单态化为两个不同的函数:

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

可以看到, 对 `&nums` 和对 `&strings` 调用的是两个不同的函数. 这么做的好处是极致的性能, 没有任何运行时开销, 编译期就可以知道调用的是哪个函数. 坏处是如果有很多类型都用了这个函数, 那么为每个类型都生成一个函数, 会导致 binary bundle size 变大.

泛型实现了 static dispatch, 因为在编译时就能静态知道调用的哪个函数. 这点对于 JS 程序员来说比较陌生, 因为 TS 的泛型在编译时会被直接擦除, 不存在 static dispatch.

### 8.3. trait object 实现子类型多态

子类型多态指的是, 一个子类型的对象可以被当父类型使用. 此时通过父类型的引用调用方法, 会优先调用子类型上的方法. 而由于 Rust 没有类和继承, 不存在父子关系, 所以这里的父子关系变为了 type 和 trait 的关系. 如果一个函数不关心自己的参数的具体类型, 只关注他实现了什么 trait, 那么就可以用 trait object

```rust
    fn get_string(input: Box<dyn ToString>) -> String {
        input.to_string()
    }

    let res1 = get_string(Box::new("123"));
    let res2 = get_string(Box::new(456));
```

上面的 `dyn ToString` 就是一个 trait object, 表示任意实现了 `ToString` 的类型. 由于不知道具体的类型, 当然也没法知道具体的大小. Rust 要求每个参数/变量都得有具体的大小, 所以需要放到一个指针类型里, 最常用的就是 `Box`, 或者直接用一个引用 `&dyn ToString`. 此时在 `get_string` 函数里, `input` 失去了具体的类型, 取而代之的是一个 `Box<dyn ToString>` 的 trait object, 所以只能调用 `ToString` 里的方法, 也就是 `to_string`.

上面的需求用泛型也可实现, 但是有些场景只能用 trait object, 典型的例子就是数组/slice/Vec 等集合类型:

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

上面代码会报错:

```rust
99  |     let res = get_strings(&[Box::new("123"), Box::new(456)]);
    |                                              -------- ^^^ expected `&str`, found integer
    |                                              |
    |                                              arguments to this function are incorrect
```

因为一个集合类型里面的元素类型必须完全相同, 但是 `Box<&str>` 和 `Box<i32>` 显然是不同的, 没有办法装到一个 slice 里. 这时候就只能用 trait object 了:

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

此时这个 slice 的元素类型为 `Box<dyn ToString>`, 是同一个类型. 这个场景遇到闭包会更加明显, 因为每个闭包的类型都是不同的, 如果要放到一个集合里就只能用 trait object, 比如 `Box<dyn Fn(i32, i32) -> i32>`.

trait object 实现了 dynamic dispatch, 因为在编译时并不知道 `item.to_string` 具体是哪个函数. 在编译时会创建一个叫 vtable 的结构, 放在制度数据段 (比如 .rodata section). 然后在运行时去根据 vtable 找到真正调用的函数, 执行调用. 具体流程如下:

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
    // 这个转换就是触发 vtable 创建和使用的关键时刻！
    let dog_animal: Box<dyn Animal> = Box::new(Dog);
}
```

1.  编译时的静态构建

    当编译器处理 let dog_animal: Box<dyn Animal> = Box::new(Dog); 这行代码时，它会执行以下一系列操作：

    1.1. 识别出 `trait-type` 组合. 编译器识别出这里有一个从具体类型 Dog 到 Trait 对象 dyn Animal 的转换。它锁定了这个组合：(Dog, dyn Animal).

    1.2. 查找并分析 trait 和 impl. 编译器查看 `Animal` trait 的定义, 它知道任何 `dyn Animal` 都需要能调用 `speak` 和 `number_of_legs` 这两个方法.

    1.3. 构建 Vtable 的内存布局

    编译器为 dyn Animal 这个 Trait 对象确定了 vtable 的结构。它本质上是一个函数指针数组（或者说结构体），其布局大致如下：

    ```c
    // 这是一个伪代码，描述 vtable 的内部结构
    struct VTableForAnimal {
    // 1. 指向析构函数的指针 (用于正确地 drop 对象)
        void (_drop_in_place)(void_);

            // 2. 对象的大小 (size) 和对齐 (alignment)
            size_t size;
            size_t align;

            // 3. 指向 Trait 中各个方法的函数指针
            String (*speak)(void*); // 指向 Dog::speak
            u8 (*number_of_legs)(void*); // 指向 Dog::number_of_legs
    }
    ```

    注意 vtable 不仅包含 trait 方法的指针, 还包含三个重要的元数据: 析构函数指针, 大小和对齐方式. 这使得 `Box<dyn Animal>` 知道如何正确地释放它所指向的, 类型被“擦除”的对象的内存.

    1.4. 创建并存储静态 Vtable 实例
    编译器会为 (Dog, dyn Animal) 这个组合创建一个全局的, 静态的, 只读的 vtable 实例. 这个 vtable 实例会被放置在最终生成的可执行文件的只读数据段(比如 .rodata section)中. 它看起来就像这样:

    ```c
    C

    // 伪代码：编译器在 .rodata 段中生成了这样一个常量
    const VTableForAnimal VTABLE_DOG_AS_ANIMAL = {
        .drop_in_place = &drop_dog,      // 指向 Dog 的析构逻辑
        .size = size_of::<Dog>(),        // Dog 类型的大小 (在这是 0)
        .align = align_of::<Dog>(),      // Dog 类型的对齐
        .speak = &Dog::speak,            // 指向 Dog::speak 函数的机器码地址
        .number_of_legs = &Dog::number_of_legs // 指向 Dog::number_of_legs 的机器码地址
    };
    ```

    - 这个 vtable 不是每个 Dog 对象都有一份，而是所有 Dog 类型在被当作 dyn Animal 使用时，共享同一个 vtable 实例。

    - 同理，编译器也会为 (Cat, dyn Animal) 组合创建另一个独立的、静态的 vtable：VTABLE_CAT_AS_ANIMAL。

2.  运行时的指针组合

    在编译期完成了上述所有准备工作后, 运行时的事情就变得非常简单了.

    当`let dog_animal: Box<dyn Animal> = Box::new(Dog);` 这行代码在运行时执行时:

    2.1. `Box::new(Dog)` 在堆上分配内存来存放一个 `Dog` 实例.

    2.2. 在进行 `Dog -> dyn Animal` 的转换时, 一个胖指针（fat pointer）被创建出来.

    2.3. 这个胖指针包含两个部分: 数据指针 -> 堆上那个 `Dog` 地址; vtable 指针 -> 指向编译器在编译期创建好的, 存储在只读数据段里的 `VTABLE_DOG_AS_ANIMAL` 的地址.

    ```
        STACK (栈)                                  HEAP (堆)                             .RODATA (只读数据段)
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

    当调用 `dog_animal.speak()` 时:

    2.4. 通过 `dog_animal` 的 `vtable_ptr` 找到 `VTABLE_DOG_AS_ANIMAL`.

    2.5. 在 vtable 里查找 `speak_ptr` 对应的函数指针

    2.6. 通过 `dog_animal` 的 `data_ptr` 找到 `Dog` 实例的地址, 并将其作为 `&self` 参数

    2.7. 调用该函数指针指向的函数, 即 `Dog::speak(&dog_instance)`.

### 8.4 trait 实现特设多态

特设多态指的是同一个操作, 根据操作数的不同类型, 执行不同的逻辑. 这一点和参数多态有区别, 参数多态是对不同的类型做相同的操作, 而特设多态是对不同的类型做不同的操作, 最典型的例子就是函数重载. 但是 Rust 不支持函数重载.
Rust 通过 trait 实现了特设多态. 给不同的类型实现同一个 trait, 但是具体的实现不同.

# 总结

从 JS 的灵活自由到 Rust 的严谨克制，学习 Rust 的过程就像是从“随心所欲”过渡到“如履薄冰”。JS 的运行时为我们屏蔽了内存管理、并发安全等底层细节，让我们可以专注于快速实现功能；而 Rust 则要求开发者直面这些挑战，通过严格的编译期检查来确保代码的安全性和性能。

这种思维转变虽然初期会带来不适，但一旦适应，你将收获更健壮、高效的代码能力。Rust 的 所有权、借用检查、模式匹配、trait 等特性，不仅是语言的设计精髓，更是现代编程思想的体现。它们迫使你以更清晰的方式组织代码，减少隐藏的 Bug，提升程序的可靠性。

如果你习惯了 JS 的“放飞自我”，Rust 可能会让你感到束缚，但正是这种束缚，最终会让你写出更稳定、更安全的程序。Rust 不是让你写得更快，而是让你写得更对。
