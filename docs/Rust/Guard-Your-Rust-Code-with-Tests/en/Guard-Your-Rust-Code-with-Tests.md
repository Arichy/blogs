# Guard Your Rust Code with Tests

In the world of software development, if there's one area that has the highest ratio of importance to neglect, it has to be testing. Often, after we finish writing the code for a feature, we do a simple check to see if it works, maybe test a few edge cases, and then declare development complete. As the codebase grows, every code modification becomes a gamble. Adding new logic is one thing, but modifying or refactoring existing logic can cause things to break in distant, unforeseen places. This is where the value of testing becomes apparent. For instance, I'm currently working on a large personal project. It's about 20% complete, but the codebase has already exceeded 15,000 lines and includes 259 test cases. Now, after iterating on a crate, I have to run the full test suite. Otherwise, not even a deity could guarantee my changes haven't broken anything.

Unlike writing application code, most people (myself included) find writing test cases to be a tedious task. It's hard for anyone to stay motivated to do something boring and not immediately essential. Fortunately, we are in the age of AI, and writing test cases is right in the comfort zone of AI coding agents. AI can think of various edge cases we might miss, write large amounts of repetitive and mechanical test cases, and doesn't require much thought.

This article will introduce several common types of testing and their related crates in Rust. However, it won't go into too much detail about their usage, because I let AI write them for me, and I'm too lazy to study the specific usage of each crate myself.

# Property Testing

Property testing (prop test) refers to testing whether something satisfies its corresponding properties. The test target is a structure. For example, in my [red-black tree](https://github.com/Arichy/red-black-tree-rs/blob/main/tests/prop_test.rs) code, I need to test if the red-black tree still satisfies its five properties after multiple rounds of operations:

```rust
use proptest::prelude::*;
use rb_tree::RBTree;

proptest! {
    #[test]
    // proptest generates a large number of random inputs for the test function,
    // allowing specification of type, range, etc.
    fn rb_tree(keys in prop::collection::vec(any::<i32>(), 1..=1000)) {
        let mut tree = RBTree::new();
        for key in &keys {
            tree.insert(*key, *key);
            // The validate method checks if the tree is valid
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
                // The validate method checks if the tree is valid
                if let Err(e) = tree.validate() {
                    panic!("Tree invalid after removing {}: {}", key, e);
                }
            }
        }
    }
}
```

Property testing can be done using the [proptest](https://docs.rs/proptest/latest/proptest/) crate. It generates a large number of random inputs for the test function, covering as many cases as possible, because we don't care about the specific test values, only whether the structure satisfies the required properties after each operation.

# Differential Testing

Differential testing refers to testing whether something is consistent with another standard implementation. The test target can be a structure or a function/method. Again, using the [red-black tree](https://github.com/Arichy/red-black-tree-rs/blob/main/tests/differential_test.rs) as an example, the purpose of a red-black tree is to implement an ordered set. How can I ensure my logic is correct? The simplest way is to compare it with a standard library ordered set like `BTreeMap`. By performing the exact same operations on both, if their outputs are identical after every step, it indicates the logic is correct.

Similarly, we use proptest to generate a large number of random inputs and combine them into random operations:

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

        // For efficiency, we only compare once after all operations are done.
        // If the comparison operation is not expensive, it can be done after each operation.
        let my_vec: Vec<_> = my_tree.iter().map(|(k, v)| (*k, *v)).collect();
        let std_vec: Vec<_> = std_tree.iter().map(|(k, v)| (*k, *v)).collect();
        assert_eq!(my_vec, std_vec, "Final content mismatch with BTreeMap");

        my_tree.validate().expect("Final tree structure is invalid");
    }
}
```

# Snapshot Testing

Actually, this whole article was just an excuse to talk about this part, because snapshot testing might be a relatively niche topic. A long time ago when I was writing React, the testing tools would mysteriously generate a bunch of snapshot files. I didn't know what they were for at the time, so I deleted them all and configured the tool not to generate them. Recently, while writing a JS parser, the boomerang from years ago finally came back and hit me.

In snapshot testing, we pass a value during the first test run, serialize a snapshot of it into a format (like JSON, YAML), and save it as a local file. In all subsequent tests, this value is compared against the existing file. If the comparison fails, the test fails.

In Rust, we use [insta](https://docs.rs/insta/latest/insta/) for snapshot testing. For example, if we want to test a sorting function `sort`, we can write:

```rust
#[test]
fn test() {
  let input = [3, 5, 2, 4, 1];

  insta::assert_json_snapshot!(sort(input));
}
```

On the first run, insta will write the value of `sort(input)`, let's assume it's `[1, 2, 3, 4, 5]`, into a file with a `.snap.new` extension in the `snapshots` directory. The file header contains metadata like the call location, and the file body is the JSON content `[1, 2, 3, 4, 5]`.
On the first run, the generated file will have a `.new` suffix, and the assert will fail. So if you call `assert_json_snapshot` multiple times in a function and run it with `cargo test`, the whole test will fail at the first assertion, and the subsequent ones won't execute. Therefore, it's best to install [cargo-insta](https://insta.rs/docs/cli/) and run tests with `cargo insta test`. This will generate all `.snap.new` files at once.

After generation, you need to run `cargo insta review` to review all snapshot files. Accept the ones that are correct and reject the ones that are not, then go fix your logic. The accepted `.snap.new` files will have the `.new` suffix removed, becoming `.snap` files, which will be used for comparison in subsequent tests.

You might ask, this doesn't seem very useful. I could just write:

```rust
#[test]
fn test() {
  let input = [3, 5, 2, 4, 1];

  assert_eq!(sort(input), [1, 2, 3, 4, 5]);
}
```

I actually discovered snapshot testing because I was recently writing a JS parser for practice, and I naturally thought of testing like this:

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

Even a simple `CallExpression` produces this much text. For a slightly more complex AST, it's impossible to write by hand, let alone asking an AI to write it.

Snapshot testing is specifically designed to solve this problem. For test cases that are impossible to write by hand, it allows them to be generated automatically. You just need to ensure that the first generation is correct.

Your next question should be: I need to write tests precisely because I don't know if my code is correct, but now you're asking me to ensure the first generation is correct. This is a classic deadlock and the biggest problem with snapshot testing. Although insta provides a review capability, I believe you (and I) don't have the patience to look at them, because these snapshots are usually very large.

There's no perfect solution to this problem. Generally, it's combined with other testing methods, such as adding some assertions beforehand to ensure key points are correct. Of course, my specific scenario is very easy to test. When generating the initial snapshot, for each piece of input JS code, I start a Node.js process, pass the JS code and the Rust-generated AST to it. Node then uses Babel to generate a Babel AST, and I compare the two for consistency. So, my code has an external "cheat" for the initial test. In theory, I could completely abandon snapshot testing and just compare with Babel in the formal tests, but creating a Node.js process is quite expensive. In comparison, using snapshots has a much smaller performance overhead.

# Summary

This article introduced three testing methods:

-   **Property Testing**: Tests whether a structure maintains certain properties at all times.
-   **Differential Testing**: Tests whether the output of a structure or function is consistent with a standard implementation.
-   **Snapshot Testing**: Compares against a snapshot generated on the first run, often used when the expected value is difficult to write by hand.

With the protection of various tests, we can iterate on existing features with confidence, leading to an order-of-magnitude improvement in development efficiency. Especially in this age of AI, AI can help us write any test case, providing a natural guard. And, the satisfaction of seeing `cargo nextest r` pass is much stronger than `cargo build`!
