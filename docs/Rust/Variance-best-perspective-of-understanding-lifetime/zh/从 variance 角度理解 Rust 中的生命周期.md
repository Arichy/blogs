本文将从 variance 角度理解 Rust 中的生命周期, 并且结合 TypeScript 解释 variance, 适用于有一定 TypeScript 背景的 Rust 初学者.

# 什么是 variance

variance (变形) 是编程语言类型系统中的一个通用概念, 广泛存在于各种语言的类型系统中, **用于描述如果一个类型 A 和类型 B 具有父子关系, 那么将一个 A 放在需要 B 的位置的可行性**.

如果 B 是 A 的子类型, 那么我们可以说 B 比 A 更有用(至少和 A 一样有用), 因为 A 有的功能 B 全都有. 所以一般情况下, 在**顺着数据流向的前提下**, 需要 A 的位置, 我们都可以放一个 B 上去. 而 variance 是将数据流向隐藏起来之后, 对**是否可以将 B 放在 A 的位置**的一种结论性总结.

variance 一般可分为下面三类

- covariance (协变)
- invariance (不变)
- contravariance (逆变)

关于 variance 的描述一般为: **类型 `T` 中, 对于类型 `U` 是 covariant/invariant/contravariant. 其中 `T` 是主要关注的类型, `U` 是在 `T` 中出现的类型**. 比如下列描述 (TypeScript):

- `T` 对于 `T` 是 covariant
- `T[]` 对于 `T` 是 covariant
- `(item: T) => void` 对于 `T` 是 contravariant
  请注意这非常重要, 说明了 variance 是一个类型与它内部的某一部分类型的关系.

由于 Rust 中没有继承, 绝大多数类型不存在父子关系, 接下来我会使用 TypeScript 举例子说明, 并且开启 `tsconfig.json` 中的 `strict`. **我会重点说明 covariance 和 invariance, 因为这两者对于理解生命周期至关重要. 最后我会简单介绍一下 contravariance**.

## Covariance

**Covariance (协变), 指的是对于类型 Parent 和 Child, 如果一个位置需要 Parent, 那么可以将 Child 放上去.**
以 TypeScript 为例:

```TypeScript
class Animal {
	name = "";

	hello() {
	}
}

class Cat extends Animal {
	catchJerry() {

	}
}

function say(animal: Animal) {
	person.hello();
}

let cat = new Cat();

say(cat);
```

`say` 函数接收一个类型为 `Animal` 的参数, 但是在调用的时候传入一个 `Cat` 类型的参数也可行, 因为 `Cat` 是 `Animal` 的子类型, `Animal` 所拥有的属性和方法 `Cat` 全都拥有, 所以 `Cat` 比 `Animal` 更有用. 在函数调用的场景里, 如果我们传入的类型比函数需要的类型更有用, 那自然是可行的. 这时候我们可以说, `Animal` 类型对于 `Animal` 是 covariant.

## Invariance

**Invariance (不变), 指的是对于类型 Parent 和 Child, 如果一个位置需要 Parent, 那么只能将 Parent 放上去, 不可以将 Child 放上去. 如果一个位置需要 Child, 那么只能将 Child 放上去, 不能将 Parent 放上去**
因为我没有找到 TypeScript 中 invariance 的例子, 所以用一个不会报错的例子来说明. 请注意以下代码即使在 `strict: true` 的条件下也可以通过编译, 但是运行时会出现类型错误.

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

上述代码调用 `handle`时传入了 `Cat[]` , 但是 `handle` 期望接收的参数是 `Animal[]`, 于是直接往里面插入了一个 `Animal` . 此时 `Cat[]` 中混进了一个 `Animal`, 但是 `Cat[]` 并不知道, 依旧将所有元素当做 `Cat` 使用, 自然会出问题.
但是反过来, 假设 `handle` 期望接收的参数是 `Cat[]`, 显而易见的, 我们也不能传 `Animal[]` 进去. 我们只能传一个类型完全为 `T[]` 的参数进去. 这种场景就叫做 invariance, 只能放完全相同的类型, 不能放父类型或者子类型.
再次强调, 这段示例代码只是为了表达 `T[]` 对于 `T` 是 invariant, 但是实际上 TS 并没有这么处理, TS 的处理是 `T[]` 对于 `T` 是 covariant.

## 数据流向

接下来我们仔细分析一下两者的差异, 为什么同样在需要某个类型的位置, 有时候可以传入子类型, 有时候不可以? 原因在于**读写**的区别.**对于只读的场景, 可以传入子类型. 对于只写的场景, 可以传入父类型. 对于读写的场景, 只能传入原类型**.

由于 TypeScript 无法按引用传递, 接下来我们使用一段伪代码来说明:

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

从上述伪代码可以看出, **variance 的根本原因是读和写两种操作的数据流向是相反的**. 我们称需要的值(参数)为 `need`, 实际传入的值为 `real`, 在读操作下, 数据是从 `real` 流向 `need`, 所以需要 `real` 包含所有 `need` 包含的信息, 即 `real` 需要是 `need` 的子类型. 相反, 在写操作下, 数据是从 `need` 流向 `real`, 所以需要 `need` 包含所有 `real` 包含的信息, 即 `need` 需要是 `real` 的子类型.
![data flow](https://github.com/Arichy/blogs/blob/main/docs/Rust/Variance-best-perspective-of-understanding-lifetime/imgs/data_flow.png?raw=true?raw=true)

## 可变性和写操作

TS 之所以允许上述 invariance 示例代码通过编译, 是因为 TS 没有声明可变性的机制. 也就是说, TS 编译器不知道 `handle` 拿到 `cats` 后会做读操作, 还是写操作. 如果 TS 严格检查, 默认读写操作都会进行, 那么传入的参数就只能是 `Animal[]`, 从而失去了很大的灵活性. 所以 TS 在严格度和灵活性之间做了权衡, 决定通过编译.

相反, Rust 强制要求显式声明可变性, 所以上面的代码如果在 Rust 中就会因为 invariance 而报错, **这也是很多生命周期报错的原因**.

所以简单总结一下:

1. TS 中, `T` 类型对于 `T` 类型是 covariant, 因为 TS 认为读操作相比写操作, 更为基础, 所以会放开一些, 优先保护读操作不出错.
2. Rust 中, `&T` 类型对于 `T` 类型是 covariant, 因为不可能通过 `&T` 修改 `T` , Rust 会保证只读.
3. Rust 中, `&mut T` 类型对于 `T` 类型是 invariant, 因为可以通过 `&mut T` 修改 `T` , 所以只允许使用完全相同的 `T` 类型.

接下来我们正式开始说明 variance 和生命周期之间的关系.

## 生命周期中的 variance

Rust 中因为不存在继承, 所以各种普通的类型之间是没有父子关系的. 但是神奇的点是, Rust 的生命周期是有父子关系的. 如果一个生命周期 `'a` 完全包含了生命周期 `'b`, 那么 `'a` 就是 `'b` 的子类型. 所以生命周期和 variance 天然地被绑定在了一起.

通过上面的总结我们已经知道了:

- `&T` 类型对于 `T` 类型是 covariance
- `&mut T` 类型对于 `T` 类型是 invariance

Rust [官方文档](https://doc.rust-lang.org/reference/subtyping.html#variance)列出了部分 variance

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

我们重点关注前两行. 请特别注意, `&'a T` 本身是一个类型, 但是这个类型里包含了另外两个类型: `&'a` 和 `T`. `&'a T` 在 `&'a` 和 `T` 的 variance 是不同的. 请看表格, `&'a T` 和 `&'a mut T` 对于 `'a` 都是 covariant 的. **也就是说在需要 `&'a T` / `&'a mut T` 的地方, 我们可以放一个 `&'b T` / `&'b mut T`, 只要 `'b` 是 `'a` 的子类型, 即 `'b: 'a`. 请牢牢记住这句话**. 这句话将抹杀掉"两个生命周期中的最小值"这个容易产生歧义的理解方式, 让每个引用自己的生命周期更加清晰.

## 生命周期 Covariance

下面这段代码已经被使用过无数次了:

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

接下来我们抛开你所熟知的`'a 指的是 x 和 y 生命周期中较短的那一个`, 从 variance 角度重新理解. 在 variance 角度下, `'a` 将会是一个具体的类型, 而不是"较短的一个", 或者"至少"之类的概念. 我认为一个具体的类型相比"较短的一个","至少", "最多", 会更加容易理解.

为了方便起见, 我会用 `1~2` 来表示代码中 1 和 2 这两个位置中间的这块生命周期.

上述代码很明显会报错, 因为在 8 处使用的返回值有可能引用的 `string2`, 然而 `string2` 在 7 处就被销毁了. 从泛型的角度来看, `longest` 函数具有一个叫做 `'a` 的生命周期泛型参数, 他期望接收生命周期为 `'a` 的 `x`, 和生命周期为 `'a` 的 `y`, 并且返回一个生命周期为 `'a` 的 `&str` 类型的值. 于是 Rust 开始进行泛型推断, 基于调用时的上下文:

- `string1_ref` 的生命周期为 `2~9`, 并且最多可以被延长到 `2~10`
- `&string2` 的生命周期为 `6~6`, 并且最多可以被延长到 `6~8`
- `res` 期望的生命周期为 `6~8` (不是从 3 开始, 因为 3 处的 `res` 没有任何读取操作, 8 处的对 `res` 读取的是在 `6` 处赋的值)

Rust 对于上述错误代码的推理过程为:

1. 将 `6~8` 代入 `'a`, 因为返回值要求至少拥有 `6~8` 的生命周期 `longest` 的函数签名就变成了: 期望接收两个生命周期为 `6~8` 的参数, 返回一个生命周期为 `6~8` 的值.
2. 接下来检查第一个参数. 第一个参数期望接收的生命周期为 `6~8`, 而传入的实际参数 `string1_ref` 生命周期为 `2~9`, `2~9` 是 `6~8` 的子类型, 符合 covariance, 通过.
3. 接下来检查第二个参数. 第二个参数期望接收的生命周期为 `6~8`, 而传入的实际参数 `&string2` 生命周期为 `6~6`. Rust 试图延长 `&string2` 的生命周期, 但是最多延长到`6~7`. `6~7`不是 `6~8` 的子类型(而是父类型), 编译失败并且报错:

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

这样报错信息我们就完全可以理解了. `&string2` 预期生命周期至少为 `6~8`, 但是实际生命周期最多被延长为 `6~7`, 所以 `&string2 does not live long enough`, 活得不够长.

上面我们理解了生命周期报错背后的 variance 原理, 接下来用同样的推理过程看看正确的代码是如何经过 covariance 而通过编译的:

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

1. `'a` 先被推断为 `6~7`.
2. 第一个参数 `string1_ref`的生命周期本来是 `2~9`, 预期是 `6~7`, 通过 covariance, `2~9` 可以赋值给 `6~7`.
3. 第二个参数 `&string2` 的生命周期本来是 `6~6`, 但是因为预期是 `6~7`, Rust 试图延长其生命周期到 `6~7`, 成功了.

**请注意, 此时 `&string2` 的生命周期被延长为了 `6~7`**. 我们可以简单证明一下. Rust 不允许对同一个值的可变引用和不可变引用有重叠的生命周期部分, 我们在 7 上方加一行:

```rust
let mut string2 = "myworld".to_string(); // 5, make it mut
res = longest(string1_ref, &string2); // 6
println!("{}", &mut string2); // add a mutable reference
println!("{}", res); // 7
```

此时编译器报错了:

```
17 |         res = longest(string1_ref, &string2); // 6
   |                                    -------- immutable borrow occurs here
18 |         println!("{}",&mut string2);
   |                       ^^^^^^^^^^^^ mutable borrow occurs here
19 |         println!("{}", res); // 7
   |                        --- immutable borrow later used here
```

可以看出, `&string2` 的生命周期确实被延长到了 7 处, 所以我们才不能在 6 和 7 之间使用一个 `&mut string2`.

## 生命周期 Invariance

回顾上面的 variance table, 我们知道 `&'a T` 对于 `T` 是 covariant, 但是 `&'a mut T` 对于 `T` 是 invariant. 用一个简单的例子证明一下:

```rust
fn test<'a>(vec: &'a Vec<&'a i32>) {
    todo!()
}

static GLOBAL_1: i32 = 1;
static GLOBAL_2: i32 = 2;
static GLOBAL_3: i32 = 3;

fn main() {
	let vec: Vec<&'static i32> = vec![&GLOBAL_1, &GLOBAL_2, &GLOBAL_3]; // 1
    test(&vec); // 2
    println!("{:?}", vec); // 3
} // 4
```

`test` 函数希望接收一个参数, 参数是一个 `vec` 引用, 生命周期为 `'a`. vec 内部的元素是对 `i32` 的引用, 生命周期也是 `'a`. 在 `main` 中, 我们手动创建了一个 `Vec<&'static i32>` 的 `vec`, 然后将 `&vec` 传给了 `test`. 此时的上下文为:

```rust
formal param: &'a  Vec<&'a      i32>
actual param: &2~2 Vec<&'static i32>
```

泛型推理总是倾向于父类型, 所以 `'a` 会被推断为 `2~2`, 而不是 `'static`. 然后, 内部`'static` 通过 covariance 赋值给 `2~2`. 编译成功.

接下来看看 `mut` 的情况:

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

类似的, 我们梳理一下推理上下文:

```rust
formal param: &'a  mut Vec<&'a      i32>
actual param: &2~2 mut Vec<&'static i32>
```

`&'a mut T` 对于 `T` 是 invariant, 而此时 `T` 是 `Vec<&'static i32>`, 所以 `'a` 只能被强制推断为 `'static`, `test` 就变成了 `fn test<'static>(vec: &'static mut Vec<&'static i32>)`, 然而 `&mut vec` 的生命周期并不是 `'static`, 所以编译失败报错:

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

**Rust 的确将 `'a` 推理成了 `'static`.** 从报错信息可以看出来:

```
type annotation requires that `vec` is borrowed for `'static`
```

这个推理结果就会导致这两个错误:

1. `vec` 活得不如 `'static` 久, 毕竟它在 4 处就被 drop 了.
2. `&mut vec` 被标记为了 `'static`, 它"可以"活到永久, 所以任何其他对 `vec` 的引用都被禁止.

# 更为复杂的例子

接下来我们看一个更复杂的经典例子:

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

上述代码在 4 处会报错:

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

我们从 variance 的角度去找一下原因和修复方式.

1. 2 处, `list.get_interface()` 会自动创建一个 `&'b mut list<'a>`, 因为 `list.get_interface()` 实际上是 `List::get_interface(&mut list)` 的语法糖.
2. `list`**包含**生命周期 `'a`. 请注意是包含, 而不是 `list` 自己的生命周期. `'a` 通过观察可以看出, 是 `1~4`, 因为在 1 和 4 处都有使用到, 所以 `'a = 1~4` .
3. 看一下 `get_interface` 的函数签名, 对于包含生命周期 `'a` 的 `list`, 参数为 `&'a mut self`, 即 `&'a mut list<'a>`

此时的推理上下文:

```rust
formal param: &'a mut list<'a>
actual param: &'b mut list<1~4>
```

由于 `&'a mut list<'a>` 对于 `list<'a>` 是 invariant, `'a` 会被直接代入为 `1~4`, 并且 `'b` 也会被直接代入为 `1~4` (实际上由于 covariance, `b` 可以比 `1~4` 更大). 也就是说, 在 3 处, 我们隐式地创建了一个 `&1~4 mut list<1~4>` 匿名可变引用. 这个匿名可变引用的生命周期会一直持续到 4, 所以 4 处会报错: 同时使用了可变引用和不可变引用.

我们尝试一下修复.

## 修复方式 1

虽然 `&'a mut T` 对于 `T` 是 invariant, 但是 `&'a T` 对于 `T` 是 covariant. 所以我们只需要去掉所有的 mut, 就可以将其转变为 covariant, 避免第一个 `'a` 被连带着强制代入 `T`中的 `'a`.

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

此时 `'a` 会被推断为 `2~2`, 而 `'b` 为 `1~4`, 经过 covariance 放在了 `'a` 的位置, 编译通过. 并且我们将 4 处改为 `&mut` 也没有报错, 说明此时 2 处创建的隐式 `&list` 生命周期确实没有到 4 处.

## 修复方式 2

上述方式去掉了 `mut`, 失去了 `Interface` 的可变性. 接下来我们看看保留 `mut` 的方式.
既然 `&'a mut List<'a>` 对于 `List<'a>` 是 invariant, 而 `List<'a>` 会被强制推断成 `List<1~4>`, 那我们就将第一个 `'a` 换成另一个生命周期泛型 `'b`, 将两者解除绑定. 预期结果是, `'a` 被推断成 `1~4`, `'b` 被推断成 `2~2`, 这样创建的临时匿名可变引用的生命周期就是 `2~2`, 不会影响到后续 4 处创建的不可变引用.

```rust
pub fn get_interface<'b>(&'b mut self) -> Interface<'a>
```

此时编译器报错了:

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

此时的生命周期大致长这样(伪代码):

```rust
    pub fn get_interface<'b>(self: &'b mut List<'a>) -> Interface<'a> {
        Interface {
            manager: &'b mut self.manager<'a>,
        }
    }
```

请特别注意, `self.manager` 的生命周期和 `self.manager` 包含的生命周期是不一样的. 我们在函数内部创建并返回的 `&mut self.manager<'a>`, 这个可变引用的生命周期是 `'b`, 而不是 `'a`, 因为它来自参数 `&'b mut List<'a>`, 这个参数是一个带着 `'b` 生命周期的可变引用.
![complex_memory](https://github.com/Arichy/blogs/blob/main/docs/Rust/Variance-best-perspective-of-understanding-lifetime/imgs/data_flow.png?raw=true?raw=true)
编译器告诉我们需要添加 `'b: 'a`. 但是我们不能这么做. 一旦这么做了, `'b` 的生命周期就会至少变成 `1~4`, 又陷入之前同样的问题.
根本原因在于返回的 `Interface` 中携带的 `manager` 引用的生命周期不应该为 `'a`, 而是应该为 `'b`, 所以我们需要更新 `Interface<'a>`, 将其自身引用的生命周期和引用目标的引用的生命周期分开:

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

到此, 编译成功. `'b` 会被推断为 `2~2`, `'a` 会被推断为 `1~4`.

## contravariance

最后简单介绍一下 contravariance, 这个主要用于函数类型.

在 TypeScript 中, `T` 对于 `T` 是 covariant, 但是 `(param: T) => void` 对于 `T` 是 contravariant.

```typescript
function handleFn(callback: (items: Cat[]) => void) {
  callback([new Cat('Tom')]);
}

handleFn((items: Animal[]) => {
  items.push(new Animal('Tom'));
});
```

`handleFn` 的参数是一个函数: `(items: Cat[]) => void`, 但是实际上可以传入 `(items: Animal[]) => void`, 因为 `handleFn` 在调用这个函数的时候, 会传入 `items`, 数据流向是从 `handleFn` 流向 `callback`, `callback` 通过读取形参 `items`, 从而读取实参 `items`. `callback` 只能将其当做更 base 的类型去读, 才能保证不读取错误.
反过来则不行. 假设 `callback` 期望的类型是 `(items: Animal[]) => void`, 实际传入的 `callback` 是 `(items: Cat[]) => void`, 那么会导致, `handleFn` 传入的是 `Animal[]`, 但是 `callback` 将其当做 `Cat[]` 来读, 发生错误.

# 总结

本文结合 TypeScript 和 Rust 介绍了 variance, 从 variance 的角度理解了生命周期.

1. `&'a T` 对于 `'a` 和 `T` 都是 covariant, 意味着可以用 `'a` 的子类型替代 `'a`, 用 `T` 的子类型替代 `T`
2. `&'a mut T` 对于 `'a` 是 covariant, 但是对于 `T` 是 invariant, 所以如果 `T` 中带有生命周期, 那么该生命周期将被强制代入对应的生命周期泛型参数.

# 小技巧

一般情况下, 永远不要写出

```rust
impl<'a> SomeStruct<'a> {
	fn some_method(&'a mut self) {}
}
```

这样的代码, 因为一旦调用 `some_struct.some_method()`, 自动创建的匿名可变引用的生命周期(`&'a mut self` 中的 `'a`)将和 `self` 的生命周期 (`SomeStruct<'a>` 中的 `'a`) 绑定, 从而导致后续再也无法使用 `some_struct`. 因为一旦使用, `some_struct` 的生命周期就会延续到使用的位置, 导致匿名可变引用的生命周期同步延续到使用的位置, 产生同时存在可变引用和不可变引用的冲突问题.
