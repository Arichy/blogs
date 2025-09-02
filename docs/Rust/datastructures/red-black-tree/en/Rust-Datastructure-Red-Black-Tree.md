# Rust Data Structures - Red-Black Tree

The Red-Black Tree is a renowned data structure, prized for its self-balancing properties, which ensure that insertion and deletion operations both have a complexity of `O(logN)`. This article will explain how to implement a Red-Black Tree in Rust, divided into three parts:

1.  Introduction to Red-Black Trees
2.  Red-Black Tree Operations
3.  Considerations related to Rust's language features

# 1. Introduction to Red-Black Trees

A Red-Black Tree is essentially a Binary Search Tree (BST). If you're not familiar with BSTs, here's a brief introduction:

## 1.1 Binary Search Tree (BST)

A Binary Search Tree is a special type of binary tree with a specific property: for any given node, all keys in its left subtree are less than its own key, and all keys in its right subtree are greater than its own key. This allows for binary searches. To find a `target_key`, if the `current_key == target_key`, you've found it. If `current_key < target_key`, the target must be in the right subtree, so you continue searching there. If `current_key > target_key`, the target must be in the left subtree. Each step eliminates half of the remaining nodes, resulting in a search time complexity of `O(logN)`.

However, the ideal is often far from reality. The structure of a BST depends on the insertion order. In an extreme case, such as inserting numbers sequentially from 1 to 1,000,000, nodes will be continuously added to the right. The BST degenerates into a linked list, and the time complexity for searches degrades to `O(N)`.

Therefore, keeping the binary tree balanced—ensuring the height difference between the left and right subtrees of any node is not too large—is crucial. The most common approach is to **add an extra set of rules** to the basic BST rules to maintain balance after any operation. Common examples include AVL trees and Red-Black Trees.

## 1.2 Rules of Red-Black Trees

A Red-Black Tree has five rules, all aimed at one goal: keeping the tree balanced after any operation.

1.  Every node is either red or black.
2.  The root node is black.
3.  All leaf nodes (NIL) are black. It's important to note the concept of NIL nodes. A NIL node is an empty node, distinct from the actual nodes you insert, find, or delete. For example, a single real node (the root) will have two NIL children. If a real node has only one real child, its other child is a NIL node.
4.  Two red nodes cannot be adjacent. In other words, the children of a red node must be black.
5.  For any given node, all simple paths from the node to its descendant NIL nodes contain the same number of black nodes (this property is called the Black-Height).

The key lies in rules 4 and 5. The combination of "no two red nodes can be adjacent" and "every path must have the same black-height" leads to two extreme scenarios:

1.  Alternating red and black nodes.
2.  Only black nodes, no red nodes.

In the most extreme case, the height of a path in scenario 1 can be at most twice the height of a path in scenario 2. This guarantees the tree's balance: the height of any path cannot be more than twice the height of any other path. This balance ensures the `O(logN)` time complexity for insertion, search, and deletion.

# 2. Introduction to Red-Black Tree Operations

The operations on a Red-Black Tree are relatively complex. Rote memorization is ineffective; it's crucial to understand the core purpose of each operation and why it works. For each step below, I will explain why it resolves the conflict. For a complex data structure like a Red-Black Tree, **I personally believe it's not necessary to force ourselves to derive every correct step from scratch, but it is necessary to understand why the standard correct operations resolve conflicts. This way, when you revisit it later, you can easily deduce the rotation directions and color changes**, rather than reciting them like a textbook verse, which is bound to be forgotten over time.

Since Red-Black Tree operations involve multiple relative nodes, we'll use the following letters to denote relationships:

- N: New node
- P: Parent node of N
- G: Grandparent node (P's parent)
- S: Sibling node of P
- U: Uncle node (P's sibling)
- FN: Far Nephew node (the child of U that is farther from N)
- NN: Near Nephew node (the child of U that is closer to N)

Red-Black Trees have two fundamental operations:

- Recoloring
- Rotation

For each operation, we need to focus on its impact, specifically on rules 4 and 5.

## 2.1 Recoloring

Recoloring means changing a node's color to a specific color. **Recoloring affects 2 paths**.

<img alt="recolor N black" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/2.1-1.png?raw=true">

A few notes about the diagrams in this article:

1.  Black nodes are drawn in gray because there is also a concept of Double-Black, which will be drawn in pure black.
2.  A circle represents a real node. The box above it represents an ancestor, and the box below represents an entire subtree. A box indicates that we **don't care about the specific nodes, which may not even exist**; it just represents that position. The number inside the bottom box represents the **number of black nodes on the path from `up` to itself**.

The diagram above shows that after N changes from red to black, the black-path from `up` to both subtrees increases by 1. If the tree was balanced before, it is now unbalanced (assuming `up` is a real node, meaning N is not the root).

## 2.2 Rotation

Rotations are divided into left and right rotations:

- A left rotation on a node promotes its right child to its position, making itself the left child of the former right child. The former right child's left child becomes the new right child of the original node.
- A right rotation on a node promotes its left child to its position, making itself the right child of the former left child. The former left child's right child becomes the new left child of the original node.

<img alt="rotate right" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/2.1-2.png?raw=true">

Only a node with a real left child can be right-rotated, and only a node with a real right child can be left-rotated.

The red box after each operation indicates that the number of black nodes from `up` to that box has changed, causing an imbalance. **It's crucial to note that we assume the initial state before each operation is balanced. For example, in the diagram above, before the rotation, the black-node counts from `up` to the three bottom boxes are 1, 1, and 0. Although not all equal, this is a balanced state because the box with 0 could have another black node below it, as long as the total count to the NIL nodes is the same. Therefore, our goal is to maintain balance, i.e., keep the numbers in the affected boxes unchanged, not to make them identical.** After the rotation, the black-node counts from `up` to LL and LR remain 1, but the count to N's right child changes from 0 to 1, meaning this path's black-height has increased by one, breaking the balance.

The core of rotation is to reorganize nodes locally. This process might temporarily change the black-node count of some paths. Our goal is to restore the black-height of all affected paths to be consistent with the state before the operation, thus maintaining the balance of the entire tree.

Due to the symmetrical nature of Red-Black Tree structures and rotations, this article will only illustrate one type of structure + rotation. The other is a mirror image.

# 3. Search

Searching in a Red-Black Tree is no different from a standard BST. Since each node stores a key-value pair, the search process is independent of color and follows the BST search procedure.

# 4. Insertion

Insertion is where the difficulty begins. First, a key point: an inserted node is always a real leaf node, meaning it's attached directly under an existing real node, not inserted by breaking a connection in the middle of the tree. The initial steps of insertion in a Red-Black Tree are identical to a BST: find the insertion position, then create and insert the new node. After this step, the Red-Black Tree's specific operations begin.

First, let's consider a question: should the newly inserted node be colored red or black? If it's red, rule 5 is not violated because adding a red node doesn't affect the black-height. However, it might violate rule 4 if its parent is also red. If it's black, rule 4 is not violated, but rule 5 is definitely violated, as the black-height of this path will increase by 1. **Fixing a black-height violation is harder than fixing a red-red conflict**. Choosing the lesser of two evils, we initialize every new node as red.

## 4.1 Parent P is Black

In this case, no rules are violated, so we're done.

## 4.2 Parent P is Red

This creates a red-red conflict that needs to be resolved. We can't just change N to black, as that would be the same as initializing it as black in the first place. We need to find a way to make P black. P cannot be directly changed to black, as this would increase the black-height of its path by 1. If P turns black and G (P's parent, N's grandparent, which must be black since P is red) turns red, the black-height through P remains unchanged, which is perfect. However, this causes two potential problems:

1.  The black-height of the path through G's other child, U (P's sibling, N's uncle), decreases by 1.
2.  If uncle U is red, G turning red will create a new red-red conflict. If U is black, this problem doesn't occur, but problem 1 remains.

So, we must consider cases based on U's color.

### 4.2.1 Uncle U is Red

This is the easiest case to solve. Simply change U to black. This solves both problems at once. So we have our first rule: **If U is red, change P and U to black, and change G to red**. This is like G passing its "blackness" down to its children P and U, while it becomes red. The number of black nodes on the paths G-P and G-U remains 1, maintaining balance. However, a new problem arises: G turning red might conflict with its own parent. This is also easy to handle. Since we've been solving red-red conflicts from the start, we can simply recurse upwards, pushing the problem up the tree until we reach the root. If the root becomes red, we can just change it to black. Changing the root from red to black increases the black-height of the entire tree by 1, which keeps it balanced.

### 4.2.2 U is Black

In this case, we can't solve it with just recoloring; any change will break the balance. So, rotation is needed. We need to consider the alignment of N-P-G. If they form a straight line, it's a simpler case.

<img alt="U is black" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-1.png?raw=true" width="40%">

How should we rotate? We can use a process of elimination.

- N cannot necessarily be rotated, as it might not have children (e.g., when just inserted).
- Similarly, U might not have a right child and thus cannot be rotated.
- P could be right-rotated, bringing N up and P down. If N then becomes black, the black-height of path `a` increases by 1, breaking the balance. To compensate, if we make G red, the left side of G is balanced, but the right side (the G-U path) has its black-height reduced by 1, still unbalanced. So this is not a viable solution.
- This leaves only rotating G as a meaningful option. G cannot be left-rotated because U is not necessarily a real child. If N is a newly inserted node, U must be a NIL node. This is because N replaced a NIL. Before this, the tree was balanced, so the black-height from G to that NIL was 2 (including the NIL, or 1 without it; the result is the same). Since U is black, if U were a real node, the black-height from G to a NIL below U would be at least 3 (G, U, and the NIL itself). Therefore, U must be a NIL to maintain a black-height of 2.

So, the only remaining option is a right rotation on G. Let's see what that looks like:

<img alt="G rotate right" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-2.png?raw=true" width="40%">

As you can see, the black-node counts to `b` and `c` from `up` are unchanged, but the count to `a` has decreased by 1. This is because we moved the shared black node G to be exclusively on the right side, reducing the black-height on the left.

At this point, we could simply change N to black, which would restore the count for `a` to 1, maintaining balance. The only concern is that the node under `up` is now the red P, which could create another red-red conflict. But that's okay; just like in the case where the uncle was red, we can push the problem upwards and solve it recursively.

If you've studied Red-Black Trees before, you might be confused at this point. "Wait, all the articles I've read say to change P to black and G to red." Let's see the effect of that:

<img alt="Color P black, color G red" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-3.png?raw=true" width="40%">

No conflicts at all! The black-heights at positions `a`, `b`, and `c` are all restored to their original balanced numbers. And since P is now black, it can't conflict with its parent. The tree is now valid, and the fix is complete.

Both of the above operations can solve the problem, but the standard solution given in all articles and textbooks is the second one: the promoted P becomes black, and the demoted G becomes red. This is more efficient, with a time complexity of `O(1)`. The first approach, if P creates a new red-red conflict with its parent, requires recursive fixing up the tree, with a worst-case time complexity of `O(logN)`.

This also shows that **there are multiple ways to fix a Red-Black Tree; the standard textbook method is just the recognized, proven optimal solution**. From now on, I will use the standard solution directly and explain its validity step-by-step.

The next case is when N-P-G form a zig-zag line (or a triangle). We first need to convert it into a straight line. This is simple: rotate P to bring the red N up and P down, creating a straight N-P-G line, then apply the solution for the straight-line case.

This concludes the insertion for Red-Black Trees. While memorizing every step for every case is pointless, a few key points can help with recall:

1.  Check the uncle's color. If it's red, the uncle and parent both turn black, the grandparent turns red, and the problem is pushed upwards.
2.  If the uncle is black, check the N-P-G line. A straight line is easiest: perform one rotation on G, then swap the colors of P and G (the one that goes up becomes black, the one that goes down becomes red).
3.  If it's a zig-zag, first rotate P to convert it into a straight-line case.

# 5. Deletion

Deletion is more complex than insertion. With insertion, we initialize the new node as red, only potentially violating the easily-fixed rule 4, not the harder-to-fix rule 5. Deletion, however, might remove a black node, violating rule 5.

Like insertion, deletion starts with a standard BST deletion. If you're not familiar with BST deletion, here's a quick review:

1.  If the node to be deleted has no children, just delete it.
2.  If it has one real child, replace the node with its child.
3.  If it has two real children, find its in-order predecessor (the rightmost node in the left subtree) or successor (the leftmost node in the right subtree), swap their positions, and then delete the node. After the swap, the node to be deleted will have at most one child.

So, the node actually deleted in a deletion operation has at most one real child. Red-Black Tree deletion builds on this foundation.

## 5.1 Deleted Node is Red

In this case, do nothing. No rules are violated. The process ends.

## 5.2 Deleted Node is Black

Now the trouble begins. We will definitely violate rule 5, and possibly rule 4 if the parent is red and the replacement child is also red. This is where the concept of "Double-Black" comes in. We mark the replacement child as Double-Black. There will always be a replacement child, even if it's a NIL node. If you're familiar with the Double-Black concept, you might wonder why it's called "Double-Black" when the path is actually missing a black node. It's because we are conceptually adding an extra "blackness" to the replacement child, pretending the path's black-height hasn't changed and the tree is still balanced. Our main job then becomes to eliminate this Double-Black mark.

There are two ways to eliminate a Double-Black:

1.  Find a way to add an extra black node to this side, allowing the Double-Black node to remove its mark.
2.  Move the Double-Black mark to a red node, which then turns black, naturally clearing the mark.

Seeing method 2, you can probably guess that if the replacement node is red, everything is fine. We just change it to black. A red-to-black change never causes a red-red conflict and only increases the black-height by 1, which is exactly what we need to compensate for the deleted black node. So, the following discussion assumes the replacement node is black, which we mark as Double-Black (let's call it X).

### 5.2.1: X's Sibling S is Red

We can't just pass X's problem to S. Imagine a balanced scale; moving a weight from the right side to the left will surely unbalance it. This situation is tricky. We need to transform it into a case where S is black. We do this by rotating P (which must be black), bringing the red S up. The promoted S turns black, and the demoted P turns red. P's other child becomes one of S's children; this child must be black and becomes X's new sibling. We now have the "X's sibling is black" case.

### 5.2.2: X's Sibling S is Black

If we could, like in insertion, make the parent and uncle black and the grandparent red, that would be great. Similarly, we want X to lose one "blackness" to become a normal black node, S to lose one "blackness" to become red, and then P to become black, as if the two children passed their "blackness" up to P. This requires a precondition: S can become red, meaning both of its children are black.

#### 5.2.2.1: S is black, and both its children (FN, NN) are also black

In this case, S can lose a "blackness" and become red, X can lose a "blackness" and become a normal black node, and P gains a "blackness". If P was red, it just turns black. If P was black, the new X is P. Just as the red-red conflict was pushed up the tree during insertion, we push the Double-Black problem up, recursively eliminating it starting from P.

#### 5.2.2.2: S is black, FN (Far Nephew) is red

This is the most complex case that doesn't transform into another case.

<img alt="S black, FN red" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-1.png?raw=true" width="40%">

Here, P's color is unknown and unimportant. We'll represent the number of black nodes it contributes as `P?`, which can be 0 or 1. Similarly, NN's color is unknown, and its contribution is `NN?`, also 0 or 1. The tree is currently balanced (note that X contributes 2 black nodes).

First, right-rotate P:

<img alt="P rotate right" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-2.png?raw=true" width="40%">

The balance is now broken. The left side, `FN down`, has lost `P?`, and the right side, `X down`, has gained 1. This is understandable because we moved P to the right and S up.

Next, swap the colors of S and P:

<img alt="Swap S P color" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-3.png?raw=true" width="40%">

S now contributes `P?` black nodes because it inherited P's color. So, `FN down` becomes `P?`, and `X down` is still `P? + 1 + 2`. These two positions are still not balanced.

Finally, we change FN to black, and X loses one "blackness" to become a normal black node:

<img alt="finish" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-4.png?raw=true" width="40%">

Now, `FN down` is restored to `P? + 1`, and `X down` is restored to `P? + 2`. Both are balanced again. Perfect.

#### 5.2.2.3: S is black, FN (Far Nephew) is black, NN (Near Nephew) is red

This needs to be converted to the "FN is red" case above, which can be done with one rotation and a recolor.

Initial state:

<img alt="init" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-1.png?raw=true" width="40%">

Left-rotate S:

<img alt="S rotate left" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-2.png?raw=true" width="40%">

Swap the colors of S and NN:

<img alt="Swap S NN color" src="https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-3.png?raw=true" width="40%">

This transforms it into the "S is black, FN is red" case.

To summarize the key points for deletion:

1.  If the deleted node is red, nothing happens.
2.  Mark the replacement node as Double-Black. If a Double-Black meets a red node, it just turns black, and we're done.
3.  If the replacement is black, look at its sibling. If the sibling can turn red, both it and the node lose one "blackness", passing it to the parent, which now has to solve the Double-Black problem.
4.  If the sibling cannot turn red, look at the far nephew. If it's red, rotate P to bring S up, swap the colors of P and S, and the Double-Black is naturally eliminated.
5.  If the far nephew is black but the near nephew is red, use a rotation to convert it to the "far nephew is red" case.

# 6. Rust Language-Specific Issues

Because Rust is a unique language, implementing a Red-Black Tree in it requires more considerations than in other languages, such as memory management, trait design, etc. If you're not interested in Rust, you can skip this section; the core Red-Black Tree content has already been covered.

## 6.1 Data Structure Design

First, let's consider the node structure. `key`, `value`, `color`, `left`, and `right` are essential. Since we need to frequently access the parent, grandparent, uncle, etc., we'll add a `parent` field for convenience.

Next, what kind of pointer should we use? In Safe Rust, one would typically use `Rc` + `RefCell`. However, for a low-level data structure like a Red-Black Tree with frequent pointer manipulations, `Rc` + `RefCell` can be cumbersome. So, we must venture into the world of Unsafe Rust, which is designed for such low-level scenarios. What about raw pointers? It's possible, but there's a better option: [NonNull](https://doc.rust-lang.org/std/ptr/struct.NonNull.html).

`NonNull` has the same size as a raw pointer `*mut T`, but the Rust compiler assumes `NonNull` is never null, a guarantee we must uphold. In this scenario, it's best to avoid null pointers to eliminate many null checks. So, we introduce a `head` sentinel node. Also, since NIL nodes are meaningful in a Red-Black Tree (they have a color), we'll add a `nil` sentinel node. While we could theoretically create a `nil` for every real node's empty child, this would waste memory. A single global `nil` sentinel is sufficient, with all null pointers pointing to it. The only issue is that when traversing, we can't get the real parent from `nil`'s `parent` field, as the global `nil`'s parent will be itself. This is a minor problem; when we might traverse to `nil`, we can just maintain a `parent` variable instead of relying on the `parent` pointer.

So, here is our first version of the `RBNode` struct:

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum Color { // Double-Black is not a color, just represented by a pointer
    Red,
    Black,
}

pub(crate) type NodePtr<K, V> = NonNull<RBNode<K, V>>;

pub struct RBNode<K, V> {
    pub(crate) key: K,
    pub(crate) value: V,
    pub(crate) color: Color,
    pub(crate) left: NodePtr<K, V>,
    pub(crate) right: NodePtr<K, V>,
    pub(crate) parent: NodePtr<K, V>,
}
```

Since a Red-Black Tree needs to compare keys, and the comparison must be strict, all keys must implement the `Ord` trait. For extensibility, we'll add two new traits, `Key` and `Value`, and add constraints to the `K` and `V` generics:

```rust
pub trait Key: Ord {}
impl<T> Key for T where T: Ord {} // blanket implement, automatically implements Key for all types that implement Ord

pub trait Value {}
impl<T> Value for T {} // Although Value currently has no constraints, we add a Value trait for future extensions

pub struct RBNode<K: Key, V: Value> {...}
```

Next, let's consider the structure of `RBTree` itself. Based on the discussion above, we need a `head` sentinel pointing to the real root (any child will do; we'll choose the right child), and a `nil` node that all empty pointers point to. To easily get the current number of nodes without traversing, we'll maintain a `len` field.

```rust
pub struct RBTree<K: Key, V: Value> {
    header: NodePtr<K, V>,
    nil: NodePtr<K, V>,
    len: usize,
}
```

Now, a new problem: what should the `key` and `value` of the `header` and `nil` nodes be? This seems unanswerable because we can't just create an arbitrary `key` and `value`, especially the `value`. What if the `value` is a `socket`? We can't just open a TCP connection to be the `head`'s `value`. You might say, "Just use the default value `Value::default()`." But that requires `Value: Default`, adding an unnecessary constraint, and it doesn't solve the example above. What if `value` is a `TcpStream` or something more complex?

This is where we need to use [MaybeUninit](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html). This type allows us to use a value without initializing it, similar to JavaScript.

So, we modify `RBNode`:

```rust
pub struct RBNode<K, V> {
    pub(crate) key: MaybeUninit<K>,
    pub(crate) value: MaybeUninit<V>,
    pub(crate) color: Color,
    pub(crate) left: NodePtr<K, V>,
    pub(crate) right: NodePtr<K, V>,
    pub(crate) parent: NodePtr<K, V>,
}
```

Now, when creating `header` and `nil`, we can do this:

```rust
impl<K: Key, V: Value> RBTree<K, V> {
    pub fn new() -> Self {
        let mut nil_node = Box::new(RBNode {
            key: MaybeUninit::uninit(), // Represents an uninitialized value; using it before initialization is UB
            value: MaybeUninit::uninit(),
            color: Color::Black,
            left: NonNull::dangling(), // Temporarily dangling, fixed immediately
            right: NonNull::dangling(),
            parent: NonNull::dangling(),
        });

        let nil_ptr = NonNull::from(&mut *nil_node);
        nil_node.parent = nil_ptr;
        nil_node.left = nil_ptr;
        nil_node.right = nil_ptr;

        let leaked_nil_ptr = NonNull::from(Box::leak(nil_node)); // Leak the value inside the Box to prevent it from being deallocated when the Box goes out of scope

        let header_node = Box::new(RBNode {
            key: MaybeUninit::uninit(),
            value: MaybeUninit::uninit(),
            color: Color::Black,
            left: leaked_nil_ptr,
            right: leaked_nil_ptr,
            parent: leaked_nil_ptr,
        });
        let leaked_header_ptr = NonNull::from(Box::leak(header_node));

        Self {
            header: leaked_header_ptr,
            nil: leaked_nil_ptr,
            len: 0,
        }
    }
}
```

Reading and writing `MaybeUninit` also requires `unsafe`, as it's a contract with the compiler: "I guarantee this value has been initialized." The compiler can't check this, so `unsafe` is used as a reminder. There are four common methods:

- `key.write(new_key)` - Write a value
- `key.assume_init()` - Take ownership
- `key.assume_init_ref()` - Get an immutable reference
- `key.assume_init_mut()` - Get a mutable reference

The last three methods require an `unsafe` block, and calling them on an uninitialized value results in UB (undefined behavior).

The rest of the Red-Black Tree implementation is straightforward. You'll find that the `header` and `nil` sentinels eliminate a lot of checks (though not all), such as whether the tree is empty, whether a sibling is null, etc.

Now comes a very difficult part of unsafe Rust: memory management (unfortunately, I have no C/C++ experience, so this was really hard for me). All the nodes of a Red-Black Tree are now leaked into memory. When the tree itself is dropped, we need to manually free every node:

```rust
impl<K: Key, V: Value> Drop for RBTree<K, V> {
    fn drop(&mut self) {
        // Collect all nodes
        let mut nodes = vec![];
        self.traverse(|node| {
            nodes.push(node);
        });

        // Drop each node
        for node in nodes {
            unsafe {
                let mut b = Box::from_raw(node.as_ptr());
                drop(b);
            };
        }

        // Don't forget the two sentinels
        unsafe {
            drop(Box::from_raw(self.header.as_ptr()));
            drop(Box::from_raw(self.nil.as_ptr()));
        }
    }
}
```

Similarly, when a node is removed, it also needs to be freed:

```rust
pub fn remove(&mut self, key: &K) -> Option<V> {
    let removed = self.bs_remove(key); // Delete according to binary search tree logic
    if self.is_nil(removed) { // If it's a nil node, do nothing, the key doesn't exist
        return None;
    }

    // Fix the red-black tree
    // ...

    unsafe {
        let removed_box = Box::from_raw(removed.as_ptr());
        let value = removed_box.value; // Transfer ownership of the value to the return value
        self.len -= 1;
        Some(value)
    }
}
```

So far, everything looks perfect. If we stop here, it's indeed fine; every node is correctly freed.

But if we want to add `Iterator`-related methods like in `BTreeMap`, we'll encounter new problems.
Let's implement `IntoIterator` for `RBTree`:

```rust
pub struct RBTreeIntoIter<K: Key, V: Value> {
    ptr: NodePtr<K, V>,
    rb_tree: RBTree<K, V>,
}

impl<K: Key, V: Value> Iterator for RBTreeIntoIter<K, V> {
  type Item = (K, V);

  fn next(&mut self) -> Option<Self::Item> {
    // ...
  }
}

impl<K: Key, V: Value> IntoIterator for RBTree<K, V> {
    type Item = (K, V);
    type IntoIter = RBTreeIntoIter<K, V>;

    fn into_iter(self) -> Self::IntoIter {
        let first = self.inorder_successor(self.header);

        RBTreeIntoIter {
            ptr: first,
            rb_tree: self,
        }
    }
}
```

Since `RBTreeIntoIter` takes ownership of `RBTree`, `RBTreeIntoIter` also needs to implement `Drop` to clean up the nodes:

```rust
impl<K: Key, V: Value> Drop for RBTreeIntoIter<K, V> {
    fn drop(&mut self) {
        let mut all_nodes = vec![];
        self.rb_tree.traverse(|node| {
            all_nodes.push(node);
        });

        // ???

        unsafe {
            drop(Box::from_raw(self.rb_tree.header.as_ptr()));
            drop(Box::from_raw(self.rb_tree.nil.as_ptr()));
        }
    }
}
```

When you try to write the `drop` method, you'll hit a fatal problem: each call to `next` transfers ownership of a node's `key` + `value`. When the node is later destroyed, it will try to destroy the `key` + `value` again, causing a double free. So, we need a mechanism to make the node skip dropping the `key` + `value` when it's destroyed. This mechanism is [ManuallyDrop](https://doc.rust-lang.org/std/mem/struct.ManuallyDrop.html).

`ManuallyDrop<T>` tells the compiler to skip dropping the value itself, allowing the developer to drop it manually at the appropriate time. So, we update the `RBNode` structure:

```rust
pub struct RBNode<K: Key, V: Value> {
    pub(crate) key: MaybeUninit<ManuallyDrop<K>>,
    pub(crate) value: MaybeUninit<ManuallyDrop<V>>,
    pub(crate) color: Color,
    pub(crate) left: NodePtr<K, V>,
    pub(crate) right: NodePtr<K, V>,
    pub(crate) parent: NodePtr<K, V>,
}
```

This way, when `RBNode` is dropped, it will skip the `key` + `value`, not executing their `drop` methods. In the `next` method, we can safely take ownership of the `key` + `value`:

```rust
impl<K: Key, V: Value> Iterator for RBTreeIntoIter<K, V> {
    type Item = (K, V);
    fn next(&mut self) -> Option<Self::Item> {
        if self.rb_tree.is_nil(self.ptr) {
            return None;
        }

        // Find the next node
        let next = self.rb_tree.inorder_successor(self.ptr);

        unsafe {
            // Bitwise copy via ptr::read, key_wrapper and value_wrapper both have ownership
            let key_wrapper = std::ptr::read(self.ptr.as_ref().key.assume_init_ref());
            let value_wrapper = std::ptr::read(self.ptr.as_ref().value.assume_init_ref());

            // Unwrap to the inner types K, V
            let key = ManuallyDrop::into_inner(key_wrapper);
            let value = ManuallyDrop::into_inner(value_wrapper);

            self.ptr = next;
            Some((key, value))
        }
    }
}

impl<K: Key, V: Value> Drop for RBTreeIntoIter<K, V> {
    fn drop(&mut self) {
        // Use an empty loop to consume all remaining (K, V) pairs
        for _ in &mut *self {}

        let mut nodes_to_dealloc = vec![];

        self.rb_tree.traverse(|node_ptr| {
            nodes_to_dealloc.push(node_ptr);
        });

        for node_ptr in nodes_to_dealloc {
            unsafe {
                // Thanks to the ManuallyDrop wrapper, the key + value of all nodes will not be dropped again
                drop(Box::from_raw(node_ptr.as_ptr()));
            }
        }

        unsafe {
            drop(Box::from_raw(self.rb_tree.header.as_ptr()));
            drop(Box::from_raw(self.rb_tree.nil.as_ptr()));
        }
    }
}
```

There's one small issue left. Because `RBTreeIntoIter` takes ownership of `RBTree`, when the former is dropped, the latter's `drop` will also be called, causing all nodes to be double-freed. This is easy to solve: we can apply the same pattern and change `RBTreeIntoIter`'s `rb_tree` field to `ManuallyDrop<RBTree<K,V>>`:

```rust
pub struct RBTreeIntoIter<K: Key, V: Value> {
    ptr: NodePtr<K, V>,
    rb_tree: ManuallyDrop<RBTree<K, V>>,
}
```

# 7. Conclusion

Although the Red-Black Tree is a notoriously difficult data structure, as long as you understand the rationale behind each operation—ensuring that from an external perspective (the number of black nodes on paths from the top of the affected part to the bottom) nothing changes—it's not that hard to remember. The most clever part is how some cases are transformed into other, easier-to-solve cases (like in deletion, turning a red sibling into a black sibling through rotation). The remaining difficulty lies mainly in the binary tree operations themselves, like pointer assignments and rotations. Implementing a Red-Black Tree in Rust adds some complexity due to manual memory management, but we successfully solved these problems using `MaybeUninit` + `ManuallyDrop`.

# 8. Complete Code

https://github.com/Arichy/red-black-tree-rs
