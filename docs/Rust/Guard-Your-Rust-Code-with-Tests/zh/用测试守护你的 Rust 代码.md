# 用测试守护你的 Rust 代码

在软件开发领域, 如果要评选一个重要性/被忽视程度 比例最高的方向, 那一定非测试莫属. 很多时候我们吭哧吭哧写完需求, 简单测测功能可以 work, 最多再测几个 edge cases, 就宣布开发完成. 等到代码堆积如山时, 每次修改代码就像一场豪赌. 新加逻辑还好说, 一旦修改/重构已有的逻辑, 自己都不知道哪个十万八千里外的地方会不会炸掉. 这时候测试的作用就体现出来了. 比如我最近在写一个大型娱乐项目, 目前进度大概在 20%, 代码量已经超过了 15k 行, 包含 259 个测试用例. 现在每次迭代完某个 crate, 都需要跑一遍完整的测试, 不然神也无法保证我的修改没有问题.

不像业务代码, 应该大部分人(包括我)都觉得写测试用例是一件很枯燥的事情. 一个人是很难有动力去做一件很枯燥, 并且当下非必须的事情. 但是幸好现在是 AI 时代, 写测试用例是 AI coding agent 绝对的舒适区. AI 可以想到各种我们想不到的 edge cases, 可以写大量重复机械的测试用例, 也不需要过多思考.

本文会介绍几个常见的测试类型, 以及在 Rust 里的相关 crates, 但不会过多介绍用法, 因为我都是让 AI 写的, 我自己也懒得去研究每个 crate 具体的用法.

# 属性测试

属性测试(prop test)指的是测试一个东西是否满足对应的属性, 测试目标是一个结构. 举个例子, 在 [红黑树](https://github.com/Arichy/red-black-tree-rs/blob/main/tests/prop_test.rs) 代码里, 就需要测试一个红黑树在经过多轮操作后是否还满足红黑树的 5 条性质:

```rust
use proptest::prelude::*;
use rb_tree::RBTree;

proptest! {
    #[test]
    // proptest 给测试函数生成大量随机输入, 可以指定类型, 范围等
    fn rb_tree(keys in prop::collection::vec(any::<i32>(), 1..=1000)) {
        let mut tree = RBTree::new();
        for key in &keys {
            tree.insert(*key, *key);
            // validate 方法检查 tree 是否合法
            if let Err(e) = tree.validate() {
                panic!("Tree invalid after initial insertions: {}", e);
            }
        }

        let mut unique_keys: Vec<_> = keys.clone();
        unique_keys.sort();
        unique_keys.dedup();

        for key in &unique_keys {
            assert!(tree.get(key).is_some());
        }


        for (index, key) in unique_keys.iter().enumerate() {
            tree.remove(key);
            if index % 100 == 0 {
                // validate 方法检查 tree 是否合法
                if let Err(e) = tree.validate() {
                    panic!("Tree invalid after removing {}: {}", key, e);
                }
            }
        }
    }
}
```

属性测试可以使用 [proptest](https://docs.rs/proptest/latest/proptest/) 这个 crate, 它会给测试函数生成大量的随机输入, 可以尽可能多覆盖, 因为我们并不关心具体的测试值, 只关心每次操作后这个结构是否满足需要的属性.

# 差分测试

差分测试(differential test)指的是测试一个东西和另一个标准的实现是否一致, 测试目标可以是结构, 也可以是函数方法. 还是拿[红黑树](https://github.com/Arichy/red-black-tree-rs/blob/main/tests/differential_test.rs)举例子, 一个红黑树的目的是实现有序集合, 如何保证我的逻辑是正确的呢? 最简单的方式就是和标准库的有序集合比如 `BTreeMap` 做对比. 对两者同时执行一模一样的操作, 如果每一步操作后两者的输出完全一致, 说明逻辑是正确的.

同样地, 使用 proptest 生成大量随机输入, 组合成随机操作:

```rust
use proptest::prelude::*;
use rb_tree::RBTree;
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
enum Op<K, V> {
    Insert(K, V),
    Remove(K),
}

proptest! {
    #[test]
    fn fast_differential_test(
        ops in prop::collection::vec(prop_oneof![
            (any::<u16>(), any::<u16>()).prop_map(|(k, v)| Op::Insert(k, v)),
            any::<u16>().prop_map(Op::Remove),
        ], 1..2000)
    ) {
        let mut my_tree = RBTree::new();
        let mut std_tree = BTreeMap::new();

        for (i, op) in ops.iter().enumerate() {
            match op {
                Op::Insert(k, v) => {
                    my_tree.insert(k, v);
                    std_tree.insert(k, v);
                },
                Op::Remove(k) => {
                    my_tree.remove(&k);
                    std_tree.remove(&k);
                }
            }

            if i % 100 == 0 {
                if let Err(e) = my_tree.validate() {
                    panic!("Tree invalid after remove iteration {}: {}", i, e);
                }
            }

            assert_eq!(my_tree.len(), std_tree.len());
        }

        // 这里为了效率, 只在所有操作结束后进行一次对比
        // 如果对比操作性能消耗不大, 也可以在每次操作结束后都进行一次对比
        let my_vec: Vec<_> = my_tree.iter().map(|(k, v)| (*k, *v)).collect();
        let std_vec: Vec<_> = std_tree.iter().map(|(k, v)| (*k, *v)).collect();
        assert_eq!(my_vec, std_vec, "Final content mismatch with BTreeMap");

        my_tree.validate().expect("Final tree structure is invalid");
    }
}
```

# 快照测试

其实是为了这点醋，我才包的这顿饺子, 因为快照测试可能是一个比较冷门的东西. 很早之前写 react 的时候, 测试工具莫名其妙就会生成一堆 snapshot 文件, 当时不知道是干嘛的, 就全部删掉, 配置让它不要生成. 最近在写 js parser 时, 多年前的回旋镖终于打回到了我头上.

在快照测试(snapshot test)中, 首次测试时我们会传入一个值, 将其快照一份序列化格式(比如 json, yaml), 存为本地文件. 在后续的所有测试里, 都会将这个值和已有的文件做对比, 对比失败则测试失败.

Rust 里用 [insta](https://docs.rs/insta/latest/insta/) 做快照测试. 举个例子, 假如要测一个排序函数 `sort`, 就可以这么写:

```rust
#[test]
fn test() {
  let input = [3, 5, 2, 4, 1];

  insta::assert_json_snapshot!(sort(input));
}
```

首次执行时, insta 会把 `sort(input)` 的值, 我们假设是 `[1, 2, 3, 4, 5]`, 写入到 snapshots 目录下的一个 `.snap.new` 后缀文件里, 文件头是一些诸如调用位置的 metadata, 文件 body 就是 `[1, 2, 3, 4, 5]` 这个 json 内容.
在首次执行, 生成的文件会是 .new 后缀, 并且 assert 会失败. 所以如果在一个函数里多次调用 `assert_json_snapshot`, 使用 `cargo test` 执行, 就会因为第一个失败而整体失败, 后面的也不会执行. 所以最好是装 [cargo-insta](https://insta.rs/docs/cli/), 然后用 `cargo insta test` 来执行, 这样会将所有的 `.snap.new` 文件一次生成出来.

生成完之后, 需要执行 `cargo insta review`, 来 review 所有快照文件. 没问题的就 accept, 有问题的就 reject, 然后去修复逻辑. 被 accept 的 `.snap.new` 文件就会去掉 `.new` 后缀, 变成 `.snap` 后缀, 在后续测试的时候就会进行对比.

你可能会问, 感觉也没有太大用啊, 我完全可以这么写:

```rust
#[test]
fn test() {
  let input = [3, 5, 2, 4, 1];

  assert_eq!(sort(input), [1, 2, 3, 4, 5]);
}
```

其实我发现快照测试这个工具是因为, 最近在写一个 js parser 练手, 很自然地就会想到需要这样测试:

```rust
assert_eq!(
  parse("call(a, b)").to_json(),
  r#"{
  "type": "CallExpression",
  "start": 0,
  "end": 9,
  "callee": {
    "type": "Identifier",
    "start": 0,
    "end": 3,
    "name": "add"
  },
  "arguments": [
    {
      "type": "Identifier",
      "start": 4,
      "end": 5,
      "name": "a"
    },
    {
      "type": "Identifier",
      "start": 7,
      "end": 8,
      "name": "b"
    }
  ],
  "optional": false,
}"#
);
```

一个简单得不能再简单的 CallExpression 就能写这么一大堆, 稍微复杂一点的 ast 别说手写, 让 AI 来写都是不可能的.

快照测试就是专门用来解决这个问题的, 对于无法手写的测试用例, 让其自动生成, 只需要保证第一次生成的是正确的就可以了.

你的下一个问题应该是, 就是因为我不知道我的代码对不对, 所以我才需要写测试, 结果你现在要求我保证第一次生成的是正确的, 这是一个典型的死锁, 也是快照测试最大的问题. 虽然 insta 提供了 review 能力, 但是相信你并没有耐心去看(我也没耐心), 因为这些快照一般都很大.

对于这个问题没有特别好的解决方案, 一般来说会结合其他的测试手段, 比如在前面添加一些 assert 来保证一些关键点是正确的. 当然我这个场景非常好测试, 在首次生成快照时, 对于每段输入 js 代码, 我都会启动一个 node 进程, 把 js 代码和 Rust 生成的 ast 传过去, node 再用 babel 生成一个 babel ast, 对比两者是否一致, 所以我的代码是有一个外挂可以做首次测试的. 当然理论上可以完全放弃快照测试, 直接在正式测试里都去这么和 babel 对比, 但是创建一个 node 进程的代价还是比较昂贵的, 相比之下用快照的性能消耗会小很多.

# 总结

本文介绍了三种测试方法:

- 属性测试: 测试某个结构在任何时候是否保持了某些属性
- 差分测试: 测试某个结构或者函数和标准实现的输出是否一致
- 快照测试: 通过首次生成的快照, 对比是否一致, 常用于 expected value 难以手写的情况

通过各方面测试的保驾护航, 才能让我们安心地去迭代已有的功能, 开发效率会有数量级的提升. 尤其是在现在这个 AI 时代, AI 可以帮助我们写任何测试用例, 获得天然的卫兵. 并且, `cargo nextest r` 运行通过的舒适感比 `cargo build` 还强烈!
