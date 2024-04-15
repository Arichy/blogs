**All scenarios in this article are under `tsconfig.compilerOptions`: `strict: true` or `strictNullChecks: true`.**
# Problem
As is known to us, `useRef` is to create a ref object which will persist for the full lifetime of the component in React. One of the most significant uses is to manipulate DOMs:
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

And it's used to hook an object which doesn't affect the render progress of React into the component as well. For instance, if there is a store object and you want to use it in the component, you might write code like this:
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

We use a way recommended by [React](https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents) to initialize the `storeRef`. The initialization will only occur once because we add a `if` block to control.

One of pros is that `storeRef` is populated with `store` during the first execution of component, making it available in the first render result. So we can call `store.get('key')` in JSX without telling if `storeRef.current` is `null`.

But the code above will throw an error:
![TS error](https://github.com/Arichy/blogs/blob/main/docs/React/A-common-TypeScript-error-with-useRef/imgs/1.png?raw=true)
TS tells us the `storeRef.current` is a read-only property, so we cannot change the value it holds.
# Cause
Let's take a look at the type annotations of `useRef`. It would be very easy if you're using VSCode.
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

There are three overloads, and we only focus on the first two. We can tell by name that `MutableRefObject` is mutable, while `RefObject` is immutable.
```typescript
interface MutableRefObject<T> {
	current: T;
}

interface RefObject<T> {
	readonly current: T | null;
}
```
It seems that we created a `MutableRefObject` instead of `RefObject`.

Let's recall the code we write and two overloads of `useRef`.
```typescript
const storeRef = useRef<Store>(null);

function useRef<T>(initialValue: T): MutableRefObject<T>;

function useRef<T>(initialValue: T | null): RefObject<T>;
```
Obviously the generic type `T` is parsed to `Store`, and the argument we pass is `null`. The first overload doesn't match it but the second one does (because only the second overload accepts `null` type argument), so TS compiler ends up choosing the second one, resulting in a `RefObject<Store>`.

# Solutions
## Option 1
The type annotation package already tells you the solution: "Usage note: if you need the result of useRef to be directly mutable, include `| null` in the type".

So we can update the code and set the generic type of `useRef` to `Store | null`. I would remove the `domRef` related code to focus more on `storeRef`.
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
It works. Take attention to the `storeRef.current.get('key')` in returned JSX, it doesn't throw any error although the type of `store` is set to `Store | null`. It's because the [type guard](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) of TS detects that in the `if` block, we assign a `store` value to `storeRef.current`. TS compiler knows that after the `if` block, the `storeRef.current` would be `Store` forever.

**But if we use `storeRef.current` in elsewhere without type guard, there will be an error.**
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

We can update the code simply by adding a protection:
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

There are three ways to solve the error. Notice the second one, the type of `value` would be `undefined | ReturnType<typeof get>` because TS compiler doesn't know `storeRef.current` would never be `null`. TS thinks it might be `null` and the whole expression might return `undefined` in advance. So we may need to add type protection for `value` again.

The third one is good. The `value` type is `ReturnType<typeof get>`, so there is no need to add type protection for it again. Easy! But there is still an annoying thing: we need to add `!` behind `storeRef.current` everywhere.

## Option 2
To avoid adding `!` everywhere, we could add it behind `null` passed to `useRef`.
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
This is perfect. We set the generic type to `Store`, so TS knows that `storeRef.current` can only be `Store`. And we add a `!` behind `null` argument, which tells TS the value will not be `null` at runtime.

Personally, I would prefer option 2 as it requires less code. But keep in mind that you can only do it when you're absolutely sure that the value will not be null at runtime. Otherwise a runtime error may bother you later. In this scenario, it's safe because we initialize `storeRef.current` instantly after the declaration.

