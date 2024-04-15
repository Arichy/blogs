**本文所有场景均在 `tsconfig.compilerOptions`: `strict: true` 或者 `strictNullChecks: true` 配置下.**

# 问题描述
众所周知, `useRef` 的作用是存储贯穿整个 React 组件生命周期的值. 其中最重要的用途就是操作 DOM:
```typescript
function App() {
	const domRef = useRef<HTMLDivElement>(null);

	useEffect(()=>{
		if (domRef.current) {
			domRef.current.innerText = 'hello world';
		}
	}, []);

	return <div ref={domRef}></div>
}
```

此外, `useRef` 还被用来存储一些不触发 React 重新渲染, 也就是与 React 的 data model (state, props 等) 完全无关的外部值. 假设现在有一个 store 对象, 你需要在组件里使用:
```typescript
class Store {
	get() {}
	set() {}
}

function App() {
	const domRef = useRef<HTMLDivElement>(null);

	useEffect(()=>{
		if (domRef.current) {
			domRef.current.style.color = 'skyblue';
		}
	}, []);
	
	const storeRef = useRef<Store>(null);

	if (storeRef.current === null) {
		storeRef.current = new Store();
	}

	return <div ref={domRef}>
		{storeRef.current.get('key')}
	</div>
}
```

上述写法使用了 [React](https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents) 官方推荐的写法来初始化 `storeRef`. 因为被 `if` 包裹, 初始过程只会发生一次.

这种写法其中一个好处在于在这个组件函数首次执行的时候, 我们就初始化了 `storeRef.current`, 使其在第一次渲染结果中就可用了. 所以我们可以直接在返回的 JSX 中调用 `storeRef.current.get('key')`.

但是上述代码会抛出一个错误:
![TS error](https://github.com/Arichy/blogs/blob/main/docs/React/A-common-TypeScript-error-with-useRef/imgs/1.png?raw=true)
TS 告诉我们 `storeRef.current` 是一个 read-only property, 所以我们无法改变它的值.

# 造成原因
让我们看一眼 `useRef` 的类型标注. 如果你在使用 VSCode, 直接 cmd + click 就可以跳转到 `@types/react` 中定义 `useRef` 的地方.
```typescript
/**
* `useRef` returns a mutable ref object whose `.current` property is initialized to the passed argument
* (`initialValue`). The returned object will persist for the full lifetime of the component.
*
* Note that `useRef()` is useful for more than the `ref` attribute. It’s handy for keeping any mutable
* value around similar to how you’d use instance fields in classes.
*
* @version 16.8.0
* @see {@link https://react.dev/reference/react/useRef}
*/
function useRef<T>(initialValue: T): MutableRefObject<T>;
// convenience overload for refs given as a ref prop as they typically start with a null value
/**
* `useRef` returns a mutable ref object whose `.current` property is initialized to the passed argument
* (`initialValue`). The returned object will persist for the full lifetime of the component.
*
* Note that `useRef()` is useful for more than the `ref` attribute. It’s handy for keeping any mutable
* value around similar to how you’d use instance fields in classes.
*
* Usage note: if you need the result of useRef to be directly mutable, include `| null` in the type
* of the generic argument.
*
* @version 16.8.0
* @see {@link https://react.dev/reference/react/useRef}
*/
function useRef<T>(initialValue: T | null): RefObject<T>;
```

里面有三个重载, 但是我们只关心前两个. 从类型名字可以看出, `MutableRefObject` 是可变的, 但是 `RefObject` 是不可变的.
```typescript
interface MutableRefObject<T> {
	current: T;
}

interface RefObject<T> {
	readonly current: T | null;
}
```
看上去我们创建了一个 `RefObject`, 而不是 `MutableRefObject`.

回忆一下我们写的调用 `useRef` 的地方, 和两个重载放在一起:
```typescript
const storeRef = useRef<Store>(null);

function useRef<T>(initialValue: T): MutableRefObject<T>;

function useRef<T>(initialValue: T | null): RefObject<T>;
```
很明显 `useRef` 的泛型类型 `T` 被设成了 `Store`, 而我们传递的参数是 `null`. 这样第一个重载就匹配不上了 (因为第一个重载参数必须是 `T`, 也就是 `Store`, 不能为 `null`). 但是第二个重载可以匹配, 所以 TS 编译器最终选择了第二个重载, 然后将返回值类型判定为了 `RefObject<Store>`.

# 解决方案
## 方案 1
其实类型标注的注释部分已经告诉了解决方案: 
> Usage note: if you need the result of useRef to be directly mutable, include `| null` in the type.

所以我们可以修改代码, 把泛型参数设为 `Store | null`. 为了更好地聚焦 `storeRef`, 我们把 `domRef` 相关的代码都删掉.
```typescript
function App() {
	const storeRef = useRef<Store | null>(null);

	if (storeRef.current === null) {
		storeRef.current = new Store();
	}

	return <div>
		{storeRef.current.get('key')}
	</div>
}
```
这下报错消失了. 注意看 JSX 中的 `storeRef.current.get('key')` , 尽管 `store` 的类型已经被设成了 `Store | null`, 但它并没有报错. 这是因为 TS 的 [type guard](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) 机制. type guard 检测到在 `if` block 中, 我们给 `storeRef.current` 赋值了一个 `Store` 类型的值, 所以在 `if` 后面的所有地方, `storeRef.current` 都会是 `Store`, 不可能是 `null` 了.

**但是如果在其他没有 type guard 的地方直接使用 `storeRef.current`, 就可能会报错.**
```typescript
function App() {	
	const storeRef = useRef<Store | null>(null);

	if (storeRef.current === null) {
		storeRef.current = new Store();
	}

	useEffect(() => {
		const value = storeRef.current.get('key'); // without narrowing of TS
		console.log(value);
	}, []);

	return <div>
		{storeRef.current.get('key')}
	</div>
}
```

![TS error](https://github.com/Arichy/blogs/blob/main/docs/React/A-common-TypeScript-error-with-useRef/imgs/2.png?raw=true)

简单修改代码, 加一些类型保护, 即可修复:
```typescript
function App() {	
	const storeRef = useRef<Store | null>(null);

	if (storeRef.current === null) {
		storeRef.current = new Store();
	}

	useEffect(() => {
		if (storeRef.current) {
			const value = storeRef.current.get('key'); // OK
			console.log(value);
		}
	}, []);

	useEffect(() => {
		const value = storeRef.current?.get('key'); // OK, but the value type would be `undefined | ReturnType<typeof get>`
		console.log(value);
	}, []);

	useEffect(() => {
		const value = storeRef.current!.get('key'); // OK, and the value type would be `ReturnType<typeof get>`
		console.log(value);
	}, []);


	return <div>
		{storeRef.current.get('key')}
	</div>
}
```

上面三种方式都可以修复这个错误. 注意看第二种方式, 返回的 `value` 类型将会是 `undefined | ReturnType<typeof get>`. 因为 TS 编译器不知道 `storeRef.current` 永远不可能是 `null`. TS 觉得它可能是 `null`, 在这种情况下整个表达式将提前返回 `undefined`. 所以后续在使用 `value` 的时候我们可能还得再对其加类型保护.

第三种方式倒是挺不错, 返回的 `value` 类型就是 `get` 的返回值, 所以不需要再对其加类型保护. 但是有一个麻烦点在于, 在每个用到 `storeRef.current` 的地方都得加一个 `!`.

## 方案 2
为了避免到处加 `!`, 我们可以直接在 `useRef` 的 `null` 参数后面加一个 `!`.
```typescript
function App() {	
	const storeRef = useRef<Store>(null!); // 1. remove `null` type. 2. add ! behind `null` argument

	if (storeRef.current === null) {
		storeRef.current = new Store();
	}

	useEffect(() => {
		const value = storeRef.current.get('key'); // without narrowing of TS
		console.log(value);
	}, []);

	return <div>
		{storeRef.current.get('key')}
	</div>
}
```
这样就很完美了. 我们将泛型设置为了 `Store`, 所以 TS 知道 `storeRef.current` 只可能是 `Store`. 并且我们在 `null` 参数后面加了一个 `!` 断言, 告诉 TS 这个值在运行时不会为 `null`.

我个人比较喜欢方案 2, 毕竟能少写一些代码. 但是请务必记住, 只有当你 100% 确认相关的值在运行时不会为 `null` 的时候才可以这么做. 否则未来可能抛出运行时错误, 又需要去 debug. 在这个场景, 这样是 100% 安全的, 因为我们在声明 `storeRef` 后立即对其进行了初始化.