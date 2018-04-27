import { TurnContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, TextPrompt, prettyConsole, WSTelemetry, consoleOnTurn, doTopic, PromptArgs } from '../src/topical';

class CustomContext extends TurnContext {
    foo = "hey"
}

class Child extends Topic<any, any, any, any, CustomContext> {

    async onStart() {
        await this.send(this.context.foo);
        this.returnToParent();
    }
}
Child.register();

class PromptForText extends TextPrompt<PromptArgs, CustomContext> {

    prompter = async () => {
        await this.send(this.context.foo);
        await this.send(this.state.args!.prompt!);
    }
}
PromptForText.register();

class Root extends Topic<any, any, any, any, CustomContext> {

    async onStart() {
        this.startChild(Child);
    }

    async onTurn() {
        await this.dispatchToChild();
    }

    async onChildReturn(child: Topic) {
        if (child instanceof Child) {
            await this.send(this.context.foo);
            this.startChild(PromptForText, {
                prompt: 'Wassup?',
            } as PromptArgs);
        } else if (child instanceof PromptForText) {
            await this.send(`You said ${child.return!.result.value}`);
            this.clearChildren();
        } else
            throw "mystery child topic";
    }

}
Root.register();


// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, new CustomContext(context))
);