import { BotContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, SimpleForm, TextPrompt, TopicWithChild, prettyConsole, WSTelemetry } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

class CustomContext extends BotContext {
    foo: string;

    constructor(context: BotContext) {
        super(context);
        this.foo = "hey";
    }
}

adapter
    .use(prettyConsole)
    .listen(async context => {
        const customContext = new CustomContext(context);
        await Topic.do(customContext, () => Foo.create(customContext));
    });


class Child extends Topic<any, any, any, any, CustomContext> {
    async init(
    ) {
        await this.context.sendActivity(this.context.foo);
        this.returnToParent();
    }
}

Child.register();

class PromptForText extends TextPrompt<string, CustomContext> {
    async prompter() {
        await this.context.sendActivity(this.context.foo);
        await this.context.sendActivity(this.state.args);
    }
}

PromptForText.register();

class Foo extends TopicWithChild<any, any, any, any, CustomContext> {
    async onChildReturn(child: Topic) {
        if (child instanceof Child) {
            await this.context.sendActivity(this.context.foo);
            this.createChild(PromptForText, {
                name: 'name',
                args: 'Wassup?',
            });
        } else if (child instanceof PromptForText) {
            console.log("I got here");
            await this.context.sendActivity(`You said ${child.returnArgs.result.value}`);
            this.clearChild();
        }
    }

    async init() {
        this.createChild(Child);
    }

    async onTurn() {  
        await this.dispatchToChild();
    }
}

Foo.register();