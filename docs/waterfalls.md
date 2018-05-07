# Waterfalls

Software is typically built as a message loop: in response to an action from a user (or an event from somewhere else), do something. By its very nature, each message is handled atomically.

This maps well to distributed applications, where each message might be handled by a different load-balanced instance of the web service.

This is very different from how we think of conversation, a linear flow where how we respond to a given message depends in large part on what has happened so far. Much of the complexity of conversation comes from this dichotomy - conversations are linear and cohesive, but applications are atomic and distributed.

Consider this conversation:
```
> What's your name?
Bill
> Nice to meet you, Bill! How old are you?
51
> Wow, you're old!
```
Here's one Topic that implements this conversation:
```ts
class Age extends Topic {

    async onStart() {
        await this.send(`Please tell me your name`);
        this.state = 0;
    }

    async onDispatch() {
        if (!this.text)
            return;

        if (this.state === 0) {
            await this.send(`Nice to meet you, ${this.text}! How old are you?`);
            this.state = 1;
        } else if (this.state === 1) {
            const age = number.ParseInt(this.text);

            await this.send(age > 30
                ? `You're ${age}? That's so old!`
                : `Phew, you've still got a few good years left`
            );
            this.state === 2;
        }
    }
}
Age.register();
```
This is a pretty naïve implementation, because there is no guarantee the user will enter text, or a valid age. If we use a prompts to validate each user response, things get more complicated:
```ts
class Age extends Topic {

    async onStart() {
        this.startChild(PromptForName);
    }

    async onDispatch() {
        await this.dispatchToChild();
    }

    async onChildEnd(child) {
        if (child instanceof PromptForName) {
            await this.send(`Nice to meet you, ${child.return.result.value}! How old are you?`);
            await this.startChild(PromptForAge, {
                prompt: `Please provide a valid age.`,
                reprompt: `How old are you?`
            });
        } else if (child instanceof PromptForAge) {
            const age = child.return.result.value;

            await this.send(age > 30
                ? `You're ${age}? That's so old!`
                : `Phew, you've still got a few good years left`
            );
        }
    }
}
Age.register();

class PromptForName extends Prompt {

    validator = hasText
        .and((activity, text) => text.length > 1 && text.length < 30 || 'invalid_name');

    async prompter(result) {
        await this.send(result
            ? `Please tell me your name`
            : `What's your name?`
        );
    }
}
PromptForName.register();

class PromptForAge extends Prompt<number, any, CultureConstructor> {

    constructor(culture?: string) {
        super();

        this.validator = hasNumber(culture)
            .and((activity, num) => num > 0 && num < 150 || 'invalid_age');
    }
}
PromptForAge.register();
```
That's a lot of code for a simple conversation.

When your conversation is unabashadly linear, you can simplify matters with a *Waterfall*, which codes a conversation as a series of functions, each of which generates a response to the user's input

Here's the waterfall version of the naiïve topic:
```ts
class Age extends Waterfall {
    waterfall(next) {
        return [
            async () => {
                await this.send(`Please tell me your name`);
            },

            async () => {
                await this.send(`Nice to meet you, ${this.text}! How old are you?`);
            },

            async () => {
                const age = number.ParseInt(this.text);

                await this.send(age > 30
                    ? `You're ${age}? That's so old!`
                    : `Phew, you've still got a few good years left`
                );
            }
        ]
    }
}
Age.register();
```
The *Waterfall* topic implements defaults for `onStart`, `onDispatch`, and `onChildEnd`, which run each function in the waterfall, in turn, as responses to the user's input. (You can optionally override these defaults, and gain more control over the waterfall flow, but that won't usually be necessary).

That sure looks simple. But of course it is the naïve version, without the prompts that can validate the user's responses.

Good news, *Waterfall* contains special support for prompts. When it comes time to execute the next function in the waterfall, if a prompt is active, the user's responses are channeled to that prompt until it is resolved. The result of the prompt is passed as the argument to the next function.
```ts
class Age extends Waterfall {

    waterfall(next) {
        return [
            async () => {
                await this.startChild(PromptForName);
            },

            async (name) => {
                await this.send(`Nice to meet you, ${name}!`);
                await this.startChild(PromptForAge, {
                    prompt: `Please provide a valid age.`,
                    reprompt: `How old are you?`
                });
            },

            async (age) => {
                await this.send(age > 30
                    ? `You're ${age}? That's so old!`
                    : `Phew, you've still got a few good years left`
                );
            },
        ];
    }
}
Age.register();
```
This is only a little shorter than the non-waterfall version (remember, both versions contain the prompt definitions). But the code now "looks" more linear, and is easier to visualize as a back-and-forth with the user.

Now imagine that this bot has the ability to look up the age of certain users. In that case, it doesn't need to do the second prompt. The `next` argument to `waterfall` allows you to plug in the argument to the next function, as if a prompt had run.
```ts
            async (name) => {
                    await this.send(`Nice to meet you, ${name}!`);
                    if (name === 'Bill Barnes')
                        next(51);
                    else
                        await this.startChild(PromptForAge, {}, { culture: 'en-us'});
                },
```
That's waterfalls. They are another way to code up a particular class of conversation as a topic.
