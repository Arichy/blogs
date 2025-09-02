# Rust 数据结构 - 红黑树

红黑树是一个大名鼎鼎的数据结构, 以其平衡性为优势, 插入删除操作的复杂度都是 `O(logN)`. 本文会介绍 Rust 中如何实现一个红黑树, 分为三部分:

1. 红黑树的介绍
2. 红黑树的操作
3. Rust 自身语言特性相关的注意事项

# 1. 红黑树的介绍

红黑树本质上就是一颗二叉搜索树 (Binary Search Tree). 如果对于二叉搜索树不熟悉, 这里简单介绍一下:

## 1.1 二叉搜索树 (BST)

二叉搜索树是一种特殊的二叉树, 特性为: 对于任何一个节点, 其左子树的所有节点 key 均小于自身, 右子树的所有节点 key 均大于自身. 这样使得我们可以在其上面做二分搜索: 对于要搜索的 `target_key`, 如果当前节点 `current_key == target_key`, 那么找到了; 如果 `current_key < target_key`, 说明目标节点在当前节点左子树, 那么向左子树继续搜索. 如果 `current_key > target_key`, 说明目标节点在当前节点右子树, 那么向右子树继续搜索, 每次都能排除掉一半节点, 所以搜索的时间复杂度为 `O(logN)`.

但是想象很美好, 现实很残酷. BST 的结构和插入顺序是相关的, 在极端情况, 也就是完全按照顺序插入的情况下, 比如从 1 插入到 1_000_000, 那么就会一直往右边插入节点, 每次查找的时候也只能向右边查找, BST 退化成了一个链表, 时间复杂度退化成了 `O(N)`.

所以如何让二叉树保持平衡, 即每个节点左右子树高度不会相差太多, 成了一个至关重要的问题. 最常见的做法就是在 BST 自身规则的基础上, **添加一组额外规则, 让其在任何操作后都能保持平衡**. 常见的树有 AVL, 红黑树.

## 1.2 红黑树的规则

红黑树有 5 条规则, 最终目的只有一个: 让其在任何操作后都保持平衡.

1. 任何一个节点要么是红色, 要么是黑色
2. 根节点为黑色
3. 所有叶子节点 (NIL) 都是黑色. 这一点需要着重注意, 在红黑树里引入了 NIL 节点的概念. NIL 节点就是空节点, 与实际插入/查找/删除的真实节点需要区分开. 举个例子, 如果只有一个真实节点(根节点), 那么它必然有两个 NIL 孩子节点. 如果一个真实节点只有一个孩子(真实节点), 那么它的另一个孩子就是 NIL.
4. 任何两个红色节点不能相连. 或者说, 红色节点的子节点必须为黑色.
5. 从任意一个节点, 到其后代所有 NIL 节点的简单路径, 经过的黑色节点数量必须相同 (这个属性叫做黑高 Black-Height)

重点在规则 4 和 5, 两个红色节点不能相连 + 任何一条路径黑高必须相同, 那么两个极端情况就是:

1. 红黑色交替出现
2. 只有黑色没有红色

极端情况下, 1 的高度为 2 的两倍, 所以保证了树的平衡: 任何一条路径高度不可能超过另一条路径两倍. 在平衡的前提下, 就能保证插入/查找/删除的 `O(logN)` 时间复杂度.

# 2. 红黑树的操作简介

红黑树的操作相对来说比较复杂, 靠死记硬背肯定是不行的, 重要的是需要理解每一个操作的核心目的, 理解为什么这个操作可以达到目的. 后面的每一步操作我都会解释为什么这样可以解决冲突. 像红黑树这种高难度数据结构, **我个人认为我们没有必要强行逼迫自己能从 0 开始推理出每一步的正确操作, 但是有必要理解标准的正确操作为什么可以解决冲突, 这样在一段时间以后再看, 就能很容易推理出旋转的方向, 变色的节点**, 而不是像背课文一样背诵"父节点右旋, 祖先节点变红, 父节点变黑", 时间久了必然会忘记.

由于红黑树操作需要看多个亲属节点, 以下用字母来表示关系 (计算机科学中一般父表示从属关系, 母表示派生关系, 所以以下一律翻译为男性亲属):

- N: New node, 新插入的节点
- P: Parent node, 新插入节点的父节点
- G: Grandparent node, 父节点的父节点, 即祖父节点
- S: Sibling node, 兄弟节点
- U: Uncle node, 父节点的兄弟, 即叔叔节点
- FN: Far Nephew node, 远侄子, 即叔叔的距离自己更远的那个孩子
- NN: Near Nephew node, 近侄子, 即叔叔的距离自己更近的那个孩子

红黑树有以下两种基本操作:

- 染色
- 旋转

对于每个操作, 我们需要关注的是带来的影响, 核心也就是对规则 4 和 5 的影响.

## 2.1 染色

变色指的是将一个节点染成某个颜色(注意染色不一定是变色, 后续在删除操作中有继承某个节点未知颜色的操作, 继承后可能颜色不变). **染色操作会影响 2 条路径**.

![recolor N black](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/2.1-1.png?raw=true)

关于本文的图, 有几个注意点:

1. 黑色节点会用灰色来画, 因为还存在一个双重黑色 (Double-Black) 的概念, Double-Black 的节点会用纯黑来画.
2. 圆形代表一个真实节点, 上面的方框代表祖先节点, 下面的方框代表整个子树, 方框表示我们**不关心具体的节点, 甚至可能不存在**, 方框只是表示那个位置. 下面方框里面的数字表示**从 up 到自己的路径上, 经历的黑色数量**

所以上面的图表示 N 由红变黑后, 从 up 到两个子树的黑路径 +1 了. 如果此前是平衡的, 那么此时就一定不平衡 (假设 up 是真实节点, 也就是说 N 自己不是根节点).

## 2.2 旋转

旋转分为左旋和右旋:

- 对一个节点左旋表示将自己的右孩子提上来取代自己的位置, 自己成为右孩子的左孩子, 同时右孩子以前的左孩子作为自己新的右孩子
- 对一个节点右旋表示将自己的左孩子提上来取代自己的位置, 自己成为左孩子的右孩子, 同时左孩子以前的右孩子作为自己新的左孩子

![rotate right](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/2.1-2.png?raw=true)

只有有真实左孩子的节点才可以右旋, 只有有真实右孩子的节点才可以左旋.

每次操作之后变红的方框表示从 up 到方框的黑色节点数量发生了变化, 导致了不平衡. **这里需要特别注意, 每次操作前的初始状态假设是平衡的, 比如上图旋转前, 从 up 到下面三个方框的黑色节点数分别为 1 1 0, 虽然三个不完全相等, 但是这是已经平衡的状态, 因为 0 那个方框完全可以下面多一个黑色节点, 只要保证到 NIL 的黑色节点数相同就可以了. 所以我们需要的是保持平衡, 即保持被影响的方框上面的数字不变, 而不是保证它们的数字相同**. 经过旋转后, 从 up 到 LL, LR 的黑色节点数没变, 依然是 1, 但是到 N 的右孩子的黑色节点数从 0 变成了 1, 说明这条路径黑高增加了一个, 破坏了平衡.

旋转操作的核心在于在局部重新组织节点。这个过程可能会暂时改变某些路径的黑色节点数。我们的目标是在旋转和颜色翻转之后，让所有受影响路径的黑高恢复到与操作前一致，从而维持整棵树的平衡

因为红黑树的结构和旋转操作具有对称性, 本文后续只会举一种结构+旋转, 另一种的操作完全镜像即可.

# 3. 搜索

红黑树的搜索和普通的 BST 无任何区别, 因为每个节点也是存储的 key + value, 搜索过程与颜色无关, 按照 BST 搜索过程即可.

# 4. 插入

插入操作就开始体现出难度了. 先明确一个点: 插入的节点一定是真实叶子节点, 也就是说一定是直接挂在某个已经存在的真实节点下面, 不会从树的中间先断开再插入. 红黑树的插入开始的步骤和 BST 一模一样, 先找到要插入的位置, 然后创建新节点插入. 这一步骤完成之后, 才开始红黑树自己的操作.

首先我们思考一个问题: 这个新插入的节点在创建时, 应该是红色还是黑色? 如果是红色, 规则 5 不会被破坏, 因为插入红色节点对黑高没有任何影响, 但是有可能破坏规则 4, 因为插入后父节点可能是红色; 如果是黑色, 规则 4 不会被破坏, 但是规则 5 一定会被破坏, 这条路径的黑高一定会 +1. **解决黑高被破坏比解决红红冲突更难**, 两害相权取其轻, 所以我们将每个新插入的节点都初始化为红色.

## 4.1 父节点 P 是黑色

这种情况下没有破坏任何一条规则, 所以直接结束.

## 4.2 父节点 P 是红色

这时就出现了红红冲突, 需要解决. 此时我们不可能把 N 变成黑色, 这样和一开始就初始化为黑色没区别了, 所以我们需要做的是想办法把 P 变成黑色. P 肯定不能直接变黑, 因为这样会导致经过自己这一条路径的黑高 +1. 如果 P 变黑之后, G 跟着变红 (G 是 P 的父节点, N 的祖父节点. 因为 P 是红色, G 一定是黑色), 那么经过 P 的路径黑高就保持不变了, 很完美. 但是这么做会有以下两个问题:

1. 经过 G 的另一个孩子, 也就是 P 的兄弟, N 的叔叔 U, 的路径黑高 -1 了
2. 如果叔叔 U 是红色, 那么 G 变红就会产生红红冲突. 如果叔叔是黑色, 倒不会有这个问题, 但是问题 1 始终无法避免.

所以我们要分情况讨论, 看 U 的颜色

### 4.2.1 叔叔 U 是红色

这种情况反而是最容易解决的, 直接让 U 变黑就可以了, 这样一下子把两个问题都解决了. 所以我们得到了第一条规律: **如果 U 是红色, P 和 U 一起变黑, G 变红**. 相当于 G 把自己的黑色分给了两个孩子 P 和 U, 自己变红, 这样经过 G-P 和 G-U 的黑色节点仍然是 1, 保持平衡. 但是这样又有新的问题, G 变红之后可能和 G 自己的父节点产生红红冲突. 这也不难办, 因为从插入开始我们就在解决红红冲突, 所以直接递归向上解决即可, 把问题向上抛, 一直到根节点为止. 如果根节点也变红了, 直接变黑即可, 因为根节点从红变黑会让整个树的黑高都 +1, 仍然平衡.

### 4.2.2 U 是黑色

这种情况下就没法单纯通过变色来实现了, 不管怎么变都会破坏平衡, 所以需要旋转. 这时候需要考虑 N-P-G 三者的连线关系. 如果是一条直线, 那么是比较简单的情况.

![U is black](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-1.png?raw=true)

具体怎么旋转呢, 我们可以用排除法一个个看.

- 首先 N 不一定能旋转, 因为 N 不一定有孩子 (比如刚插入), 没有孩子的节点不能旋转
- 同理, U 也不一定右孩子, 不一定能选择
- 其次 P 可以右旋, 让 N 上来取代自己, P 下去. 如果此时 N 变黑, 那么 a 位置的路径黑色会 +1, 平衡被破坏. 作为补偿, 让 G 变红, 这样 G 左边就保持平衡了, 但是右边也就是 G-U 这条路径的黑高 -1 了, 仍然不平衡, 所以该方案不可行.
- 所以只剩下 G 旋转有意义了. G 其实不能左旋, 因为 U 不一定是真实孩子. 在如果 N 是新插入的节点, 那么 U 必然是 NIL. 原因是 N 取代了一个 NIL. 在取代之前这棵树一定是平衡的, 那么从 G 开始到 NIL 的黑高是 2(包含 NIL, 不包含就是 1. 是否包含 NIL 不影响结果). 已知 U 是黑色, 如果 U 是真实节点, 那么从 G 到 U 下面的 NIL 黑高至少为 3(G, U, NIL 自身), 所以 U 一定是 NIL, 保持黑高为 2.

所以只剩下 G 右旋这一种操作了. 我们看看 G 右旋后的样子:

![G rotate right](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-2.png?raw=true)

可以看到 up 到 b c 的黑色节点数没变, 但是 a 的 -1 了, 这是因为我们把一个公共的黑色的 G 移到了右边独占, 所以左边黑高就少了 1.

此时我们可以直接将 N 变黑, 这样 a 的数字变回到了 1, 保持了平衡. 唯一需要担心的是现在 up 下面的节点变成了红色的 P, 又有可能产生红红冲突. 不过没关系, 和之前叔叔是红色的情况一样, 我们把问题向上抛, 向上递归解决即可.

看到这里, 如果你之前了解过红黑树, 或许你会疑惑, 不对啊, 我看过的所有文章都说的是此时应该 P 变黑, G 变红啊. 让我们看看这样做的效果:

![Color P black, color G red](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/4.2.2-3.png?raw=true)

无任何冲突! 此时 a b c 三个位置的黑高都恢复成了最开始平衡时的数字, 并且 P 变黑也不可能和 P 的父节点产生冲突. 此时的树就是合法的, 修复结束.

上面的两种操作都可以解决问题, 但是所有的文章, 教科书给出的标准解法都是第二种, 上去的 P 变黑, 下来的 G 变红, 因为这样效率更高, 时间复杂度为 `O(1)`. 而第一种方案, 一旦 P 与父节点产生了新的红红冲突, 又要递归向上解决, 时间复杂度最坏是 `O(logN)`.

这里我们也能看出, **其实红黑树有多种修复方式, 只是教科书里的标准方式是公认的, 经过证明后的最优解**. 接下来我不会再一步步推理, 而是直接使用标准解法, 然后一步步解释这么做的合法性.

接下来的情况是, 如果 N-P-G 三者的连线关系是一条折线 (或者叫三角形), 那么我们需要先转换为直线的样子. 这个转换操作就很简单了, 对 P 旋转即可, 把红色的 N 转上来, P 转下去, 让新的 N-P-G 形成一条直线, 然后走上面直线的解法, 不多赘述.

到此, 红黑树的插入就介绍完毕了. 虽然死记硬背每一种情况的每一个步骤没有意义, 但是还是有几个关键点可以辅助记忆:

1. 看叔叔的颜色. 如果是红色, 那么叔叔和父亲一起变黑, 爷爷变红, 问题向上抛.
2. 如果叔叔是黑色, 看 N-P-G 的线, 直线最好办, 对 G 进行一次旋转, 然后 P G 变色, 上去的变黑, 下来的变红.
3. 如果是折线, 那么先对 P 旋转, 转换成直线的情况.

# 5. 删除

删除比起插入更复杂, 因为插入的时候我们初始化新节点为红色, 只破坏了容易修复的规则 4, 没有破坏不容易修复的规则 5. 但是删除可能删除黑色节点, 破坏了不容易修复的规则 5.

和插入一样, 删除也是先进行普通 BST 的删除. 如果你不熟悉 BST 的删除, 这里简单复习一下:

1. 如果要删除的节点没有孩子, 直接删除
2. 如果有一个真实节点孩子, 把自己删除后让这个孩子来顶替自己
3. 如果有两个真实节点孩子, 那么找到中序前驱节点(或者后继节点), 也就是左孩子树的最右边的节点(或者右孩子树的最左边的节点), 和这个节点交换位置, 然后将自己删除. 交换位置之后, 被删除的节点最多只会有一个孩子.

所以删除操作删除的节点最多有一个真实孩子, 红黑树的删除会建立在这个基础上.

## 5.1 删除的节点是红色

这种情况什么也不做, 不会有任何一条规则被破坏, 结束.

## 5.2 删除的节点是黑色

这下麻烦就来了, 我们一定会破坏规则 5, 也可能破坏规则 4, 如果父节点是红色, 顶替上来的孩子也是红色的话. 这时候需要引入一个叫做 Double-Black (双重黑色) 的概念. 我们将顶替上来的孩子标记为 Double-Black. 一定会有孩子顶替上来, 哪怕是 NIL. 如果你之前了解过 Double-Black 的概念, 你可能会好奇, 明明这条路径是少了一个黑色, 为什么反而叫 Double-Black? 其实是因为我们相当于给顶替上来的孩子多加了一个黑色, 这样假装这条路径的黑高没变, 假装整棵树还是平衡的. 之后我们的核心工作就是消除 Double-Black 标记.

Double-Black 有两种消除方式:

1. 给这边想办法多弄一个黑色节点出来, 这样 Double-Black 节点就可以拿下标记
2. 将 Double-Black 标记想办法移动到红色节点上, 让红色节点变黑, 标记自然清除

看到方式 2, 其实你也就能想到, 如果顶替上来的是红色, 反而万事大吉, 只需要将其变黑即可. 红变黑的操作永远不会产生红红冲突, 只会导致黑高 +1, 而我们删除了一个黑色节点, 少了一个黑色, 恰好弥补上. 所以接下来讨论顶替上来的节点是黑色的情况, 将其标记为 Double-Black. 为了简单, 后续将 Double-Black 称为 X.

### 5.2.1: X 的兄弟 S 是红色

这种情况可不能直接将 X 扔给 S, 想象一个已经平衡的天平, 将右边的砝码拿一个放到左边, 必然会打破平衡. 这种情况比较棘手, 我们需要转换成 S 是黑色的情况, 也就是让 P(必然是黑色) 旋转, 将红色 S 转上去, 同时上去的 S 变黑, 下来的 P 变红. 此时 P 的另一个孩子会变成 S 的一个孩子, 这个孩子必然是黑色, 作为 X 的新兄弟. 我们就得到了"X 的兄弟是黑色"的情况.

### 5.2.2: X 的兄弟 S 是黑色

如果我们能像插入时候那样, 让父亲和叔叔一起变黑, 让爷爷变红, 那就好了. 类似的, 我们希望 X 能少一个黑色, 变为普通黑色, S 也少一个黑色, 变成红色, 然后让 P 变黑, 相当于两个孩子将自己的黑色提供给了 P. 这么操作需要一个前提条件: S 可以变红, 也就是说 S 的两个孩子都是黑色.

#### 5.2.2.1: S 黑, S 的两个孩子 (FN, NN) 也都是黑

此时就可以让 S 失去一个黑色, 变为红色, X 也失去一个黑色, 变成普通的黑色, 然后 P 获得一个黑色. 如果 P 是红色, 染黑即可. 如果 P 是黑色, 那么新的 X 就是 P. 和插入时红红冲突问题向上抛一样, 我们把 Double-Black 问题也向上抛, 从 P 开始向上递归消除.

#### 5.2.2.2: S 黑, FN(远侄子)红

这是红黑树所有情况里不转换为其他情况的最复杂的情况.

![S black, FN red](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-1.png?raw=true)

此时 P 颜色未知, 也不重要. 对于这个位置提供的黑色节点数量, 我们用 `P?` 表示, 可能为 0 也可能为 1. 同理, NN 的颜色未知, 也不重要, 提供的黑色节点数量用 `NN?` 表示, 同样可能为 0 或者 1. 此时整棵树是平衡的 (注意 X 提供的黑色节点数量是 2).

先对 P 右转:

![P rotate right](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-2.png?raw=true)

此时平衡被打破, 左边 FN down 少了 `P?`, 右边 X down 多了 1. 这可以理解, 因为我们把 P 挪到了右边, 把 S 挪上来了.

然后交换 S 和 P 的颜色:

![Swap S P color](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-3.png?raw=true)

此时 S 提供的黑色节点数量依然是 `P?`, 因为它获得了 P 的颜色, 所以 FN down 变为 `P?`, X down 依然是 `P? + 1 + 2`, 这两个位置依然不平衡.

最后我们把 FN 变黑, X 失去一个黑色, 变为普通黑色:

![finish](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.2-4.png?raw=true)

现在 Fn down 恢复了 `P? + 1`, X down 恢复成了 `P? + 2`, 都恢复了平衡, 完美.

#### 5.2.2.3: S 黑, FN(远侄子)黑, NN(近侄子)红

此时需要转换成上面 FN 红的情况, 一次旋转+变色即可.

初始状态:

![init](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-1.png?raw=true)

将 S 左旋:

![S rotate left](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-2.png?raw=true)

将 S, NN 交换颜色:

![Swap S NN color](https://github.com/Arichy/blogs/blob/main/docs/Rust/datastructures/red-black-tree/imgs/5.2.2.3-3.png?raw=true)

就转换为了 S 黑, FN 红的情况.

总结一下删除的记忆点:

1. 如果删除的是红色, 无事发生.
2. 将顶上来的标记为 Double-Black. 如果 Double-Black 遇到红色, 直接变黑结束.
3. 如果顶替上来的是黑色, 看兄弟. 如果兄弟可以变红, 那么自己和兄弟的黑色都 -1, 扔给父亲, 让父亲去解决 Double-Black 问题.
4. 如果兄弟不可能变红, 看远侄子. 如果是红色, 那么 P 转一下把 S 转上来, P 和 S 交换颜色, Double-Black 自然消除.
5. 如果远侄子是黑色, 近侄子是红色, 那么通过旋转转换为远侄子是红色的情况.

# 5. Rust 语言特性相关问题

Rust 因为自己本身就是个比较特别的语言, 相比其他语言实现红黑树, Rust 需要有更多的考虑, 比如内存管理, trait 设计等. 如果你对 Rust 不感兴趣, 可以直接跳过, 红黑树本身的内容已经在上面介绍完毕.

## 5.1 数据结构设计

首先考虑节点的结构. `key`, `value`, `color`, `left`, `right` 必不可少. 由于需要频繁访问父亲, 祖父, 叔叔等亲属, 所以加一个 `parent` 来方便访问.

然后考虑使用什么样的指针. 在 Safe Rust 里, 一般会用 `Rc` + `RefCell`. 但是由于本身红黑树是非常底层的数据结构, 里面的指针操作会非常频繁, `Rc` + `RefCell` 会非常不便于使用. 所以我们需要大胆走入 Unsafe Rust 的世界, 因为 Unsafe Rust 就是为了这种偏底层的场景而设计的. 那么直接使用裸指针怎么样? 可以是可以, 但是有更好的选择: [NonNull](https://doc.rust-lang.org/std/ptr/struct.NonNull.html).

`NonNull` 和普通的裸指针 `*mut T` 有着一样的大小, 区别在于 Rust 编译器认为 `NonNull` 永远不为空, 当然这一点是需要我们去保证的. 在这个场景里, 我们最好能避免空指针, 这样可以少掉很多判空条件. 所以我们引入 `head` 哨兵节点. 同时由于 NIL 节点在红黑树里是有意义的, 它是有颜色的, 所以我们再引入一个 `nil` 哨兵节点. 虽然理论上可以给每个真实节点的空孩子都创建一个 `nil`, 但是那样会浪费比较多的内存, 并且实践中也不需要这样做, 创建一个全局的 `nil` 哨兵即可, 然后让所有的空指针都指向它. 这么做唯一的问题在于遍历时没法通过 `nil` 的 `parent` 获得真实节点了, 因为 `nil` 全局唯一, 它的 `parent` 会被设为 `nil` 自己. 但是这个问题不大, 当遇到可能遍历到 `nil` 的场景时我们放弃使用 `parent` 指针, 直接维护一个 `parent` 变量就可以了.

所以我们得到了第一版 `RBNode` 结构体

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum Color { // Double-Black 不作为一个颜色, 只用一个指针来表示
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

由于红黑树中需要比较 `key` 的大小, 并且需要严格可比较, 所以所有的 `key` 都必须实现 `Ord` trait. 出于可扩展性考虑, 我们新增两个 `Key` 和 `Value` 的 trait, 然后给 `K` `V` 泛型增加限制:

```rust
pub trait Key: Ord {}
impl<T> Key for T where T: Ord {} // blanket implement, 给所有实现了 Ord 的类型都自动实现 Key

pub trait Value {}
impl<T> Value for T {} // 虽然 Value 目前没有任何限制, 但是仍然加一个 Value trait, 方便以后加限制

pub struct RBNode<K: Key, V: Value> {...}
```

接下来考虑 `RBTree` 自身的结构. 经过上面的讨论, 需要一个 `head` 哨兵, 指向真实的根节点(任意一个孩子都行, 这里选择右孩子), 需要一个 `nil` 节点, 所有空指针都指向它. 同时为了方便获得当前节点数量避免遍历, 维护一个 `len` 字段.

```rust
pub struct RBTree<K: Key, V: Value> {
    header: NodePtr<K, V>,
    nil: NodePtr<K, V>,
    len: usize,
}
```

好, 接下来思考一个新问题: `header` 和 `nil` 的 `key`, `value` 应该是什么值? 这个问题好像没法回答, 因为我们不可能随便创建一个 `key` 和 `value` 放进去, 尤其是 `value`. 如果 `value` 是一个 `socket` 呢, 我们总不能平白无故去连接一个 TCP connection 作为 `head` 的 `value` 吧. 你可能会说, 那我直接使用默认值 `Value::default()` 不就好了. 但是这样做要求 `Value: Default`, 平白无故给 `Value` 加了限制, 也没法解决上面举的例子, 万一 `value` 是一个 `TcpStream` 或者其他更复杂的值呢?

此时我们需要使用 [MaybeUninit](https://doc.rust-lang.org/std/mem/union.MaybeUninit.html) 来解决这个问题. 这个类型让我们可以像 JavaScript 里那样, 不用初始化一个值就可以用.

所以修改 `RBNode`:

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

这样在创建 `header` 和 `nil` 的时候就可以:

```rust
impl<K: Key, V: Value> RBTree<K, V> {
    pub fn new() -> Self {
        let mut nil_node = Box::new(RBNode {
            key: MaybeUninit::uninit(), // 表示未初始化的值, 在初始化之前使用会 UB
            value: MaybeUninit::uninit(),
            color: Color::Black,
            left: NonNull::dangling(), // 暂时悬垂, 后面立即修复
            right: NonNull::dangling(),
            parent: NonNull::dangling(),
        });

        let nil_ptr = NonNull::from(&mut *nil_node);
        nil_node.parent = nil_ptr;
        nil_node.left = nil_ptr;
        nil_node.right = nil_ptr;

        let leaked_nil_ptr = NonNull::from(Box::leak(nil_node)); // 将 Box 内部的值泄露出来, 避免 Box 离开作用域时将其回收

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

`MaybeUninit` 在读写时也需要 unsafe, 因为这相当于我们和编译器的一个约定: 我保证这个值已经初始化过了. 这个保证编译器无法检查, 所以只能用 unsafe 来提醒我们注意. 常用的方法有 4 个:

- `key.write(new_key)` - 写入值
- `key.assume_init()` - 获取所有权
- `key.assume_init_ref()` - 获取不可变引用
- `key.assume_init_mut()` - 获取可变引用

后面 3 个方法都需要 unsafe block, 并且一旦对未初始化的值调用就会 UB (undefined behavior).

接下来红黑树本身的实现就没有什么问题了, 你会发现因为 `header` 和 `nil` 两个哨兵的存在, 算法里会少非常多的判断(但不代表完全不用判断), 比如树是否为空, 兄弟是否为空等等.

接下来就是 unsafe Rust 相当难的一个点了: 内存管理 (很不幸我没有任何 C/C++ 经验, 这个对我来说真的很难). 现在一颗红黑树的所有节点都已经泄露在内存里了, 当红黑树自己 Drop 的时候, 需要手动去 free 每一个节点:

```rust
impl<K: Key, V: Value> Drop for RBTree<K, V> {
    fn drop(&mut self) {
        // 搜集所有节点
        let mut nodes = vec![];
        self.traverse(|node| {
            nodes.push(node);
        });

        // 对每个节点都 drop
        for node in nodes {
            unsafe {
                let mut b = Box::from_raw(node.as_ptr());
                drop(b);
            };
        }

        // 别忘了两个哨兵
        unsafe {
            drop(Box::from_raw(self.header.as_ptr()));
            drop(Box::from_raw(self.nil.as_ptr()));
        }
    }
}
```

同时当删除一个节点时, 也需要将其 free:

```rust
pub fn remove(&mut self, key: &K) -> Option<V> {
    let removed = self.bs_remove(key); // 按照二叉搜索树的删除逻辑删除
    if self.is_nil(removed) { // 如果是空节点, 什么也不做, 说明这个 key 不存在
        return None;
    }

    // 修复红黑树
    // ...

    unsafe {
        let removed_box = Box::from_raw(removed.as_ptr());
        let value = removed_box.value; // 将 value 所有权交出给返回值
        self.len -= 1;
        Some(value)
    }
}
```

好, 目前看上去一切都很完美. 如果只是实现到这一步, 那确实已经没有问题了, 每个节点都被正确 free 了.

但是如果我们想模仿 `BTreeMap` 那样增加 `Iterator` 相关方法, 就会遇到新的问题.
现在我们来给 `RBTree` 实现 `IntoIterator`:

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

由于 `RBTreeIntoIter` 获得了 `RBTree` 的所有权, `RBTreeIntoIter` 也需要实现 Drop 来清理节点:

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

当你尝试写 drop 方法的时候, 你就会遇到一个致命问题: 每次 `next` 调用都会将一个节点的 `key` + `value` 所有权交出去, 后面再销毁这个节点时, 这个节点会再次尝试销毁 `key` + `value`, 造成 double free. 所以我们需要一个机制来让节点销毁时, 跳过 `key` + `value`. 这个机制就是 [ManuallyDrop](https://doc.rust-lang.org/std/mem/struct.ManuallyDrop.html).

`ManuallyDrop<T>` 会让编译器在 drop 时, 跳过自己, 然后开发者手动在合适的时候 `drop`. 所以更新 `RBNode` 的结构:

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

这样 `RBNode` 在 drop 时, 就会跳过 `key` + `value`, 不执行这两个类型的 drop 方法, 在 `next` 方法里就可以放心大胆地获得 `key` + `value` 的所有权:

```rust
impl<K: Key, V: Value> Iterator for RBTreeIntoIter<K, V> {
    type Item = (K, V);
    fn next(&mut self) -> Option<Self::Item> {
        if self.rb_tree.is_nil(self.ptr) {
            return None;
        }

        // 找到下一个节点
        let next = self.rb_tree.inorder_successor(self.ptr);

        unsafe {
            // 通过 ptr::read 按位拷贝, key_wrapper 和 value_wrapper 都有所有权
            let key_wrapper = std::ptr::read(self.ptr.as_ref().key.assume_init_ref());
            let value_wrapper = std::ptr::read(self.ptr.as_ref().value.assume_init_ref());

            // 还原成内部类型 K, V
            let key = ManuallyDrop::into_inner(key_wrapper);
            let value = ManuallyDrop::into_inner(value_wrapper);

            self.ptr = next;
            Some((key, value))
        }
    }
}

impl<K: Key, V: Value> Drop for RBTreeIntoIter<K, V> {
    fn drop(&mut self) {
        // 用一个空循环来消耗掉剩余所有的 (K, V)
        for _ in &mut *self {}


        let mut nodes_to_dealloc = vec![];

        self.rb_tree.traverse(|node_ptr| {
            nodes_to_dealloc.push(node_ptr);
        });

        for node_ptr in nodes_to_dealloc {
            unsafe {
                // 由于 ManuallyDrop 的包裹, 所有节点的 key + value 都不会被再次 drop
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

此时还有一个小问题. 因为 `RBTreeIntoIter` 内部拿到了 `RBTree` 的所有权, 当前者 drop 时, 也会调用后者的 drop, 导致所有节点都被 double free. 这个问题也不难, 我们照葫芦画瓢, 将 `RBTreeIntoIter` 的 `rb_tree` 也改为 `ManuallyDrop<RBTree<K,V>>` 即可:

```rust
pub struct RBTreeIntoIter<K: Key, V: Value> {
    ptr: NodePtr<K, V>,
    rb_tree: ManuallyDrop<RBTree<K, V>>,
}
```

# 6. 总结

红黑树虽然作为大名鼎鼎的高难度数据结构, 但其实只要理解了每一个操作的合理性, 也就是保证从外部(受影响的部分的顶部到底部的路径经过的黑色节点数)看不发生变化, 那么记起来还是不难的. 最巧妙的是对于某些情况, 通过转换成另外一些更容易解决的情况(比如删除操作中, 把红兄弟通过旋转变成黑兄弟). 剩下的难度主要就是二叉树本身的操作, 比如指针赋值, 旋转等. 而 Rust 实现红黑树, 因为需要手动管理内存, 又引入了一些复杂度, 但是我们通过 `MaybeUninit` + `ManuallyDrop` 成功解决了这些问题.

# 7. 完整代码

https://github.com/Arichy/red-black-tree-rs
