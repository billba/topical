# *Topical* patterns

The *Topics* pattern is intentionally very general purpose, enabling a number of different patterns. This page will attempt to document known patterns -- if you find a new one, pleae add it here!

## Single Active Child

This is the simplest and most common pattern. A topic's `this.children` array is initially empty. A trigger event causes a child to be started and set as the sole member of `this.children`. When this is the case, subsequent activities are dispatched to the child, which continues until the child topic completes by calling its `this.end()` method with or without a return value, at which point the parent topic's `this.children` array is cleared (emptied), and the cycle can be repeated.

```ts
class Root extends Topic {

    async onStart() {
        await this.send("How can I help you today?");
    }

    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }

    async onChildReturn() {
        await this.send(`Welcome back to the Root!`);
        this.clearChildren();
    }
}
Root.register();
```

## Intercepted Messages

Sometimes you want a parent topic to intercept certain messages and handle them rather than dispatching them to the child:
```ts
    async onDispatch() {
        if (this.text === 'time') {
            await this.send(`The current time is ${new Date().toLocaleTimeString()}.`);
            return;
        }

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }
```

## Child cancelation

Sometimes you want a parent to permanently stop dispatching messages to its child. This is as simple as clearing `this.children`.

```ts
    async onDispatch() {
        if (this.text === `cancel`)
            this.clearChildren();

        if (await this.dispatchToChild())
            return;

        if (this.text === "book travel") {
            await this.startChild(TravelTopic);
        }
    }
```

**Note:** it is likely that `Topic` will get an `onEnd` method so that a child topic has an opportunity to clean up when it is ended by a parent.

## Scoring

A child topic can contribute data towards the decision of whether its parent should start and/or dispatch to it.

### Start Score

Sometimes a child knows better than its parent whether it should be started. In this scenario, the child needs to be *created* but not *started*:

```ts
    async onStart() {
        this.child = this.createTopicInstance(TravelTopic);

        await this.send("How can I help you today?");
    }
```

We then *score* each incoming activity until the child topic signals it should be started:

```ts
    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        const topic = await this.loadTopic(this.child);

        const startScore = await topic.getStartScore();

        if (startScore)
            await topic.start(startScore.startArgs);
    }
```

The result of `getStartScore` is either `void` or a `StartScore` object containing: 
* 0 > `score` <= 1, representing the topic's confidence that the current activity should start it
* `startArgs` that should be supplied to its `start` method in that case.

You can use this data however you see fit. Here we ignore the score, but you could compare it do a threshold value:

```ts
        if (startScore && startScore.score > .5)
            await topic.start(startScore.startArgs);
```

This is a common enough pattern that *Topical* contains a helper function called `startIfScore`. It returns `true` if the topic was started, `false` if it was not started, or started and completed.

```ts
    async onDispatch() {
        if (await this.dispatchToChild())
            return;

        if (await startIfScore(await this.loadTopic(this.child)), .5) // threshold value is optional
            return;
    }
```

Not all topics have triggers. If not, calling `getStartScore()` will return void.

If you have multiple children, the helper `startBestScoringChild` will try every child in `this.children` and start the one returning the highest score, so you can load up a number of potential children and let them duke it out. Multiple scoring only works if all topics are calibrated. One bad apple can spoil the bunch. 

### Dispatch Score

Similarly, a started topic can also score its confidence that it should be the one to receive an incoming activity. 

Dispatch scoring is not for the faint of heart. There are many variables to take into account by both the parent and child, and calibration across topics is critical. It is a power tool to be used with all due caution. 

The process of calculating a score may overlap with the process of dispatching an activity. For instance, in both cases the same LUIS model may be run. `getDispatchScore` can return the LUIS intent, which can be used by its `onDispatch` method instead of running the same model again.

```ts
    async onDispatch() {
        const topic = await this.loadTopic(this.child);

        const dispatchScore = await topic.getDispatchScore();

        if (dispatchScore)
            await this.dispatchToChild(undefined, dispatchScore.dispatchArgs);
    }
```

## Prompts

Read up on [prompts](./prompts.md)

## Waterfalls

Read up on [waterfalls](./waterfalls.md)

## Confirmation

TK

For one example of this, see the [dispatch](./samples/dispatch.ts) sample.

## Resolving ambiguity

TK

