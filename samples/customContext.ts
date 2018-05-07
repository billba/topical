import { TurnContext, MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, WSTelemetry, consoleOnTurn, doTopic, PromptArgs, Prompt, hasText } from '../src/topical';

class CustomContext extends TurnContext {
    foo = "hey"
}

class Child extends Topic<any, any, any, CustomContext> {

    async onStart() {
        await this.send(this.context.foo);
        await this.end();
    }
}
Child.register();

class PromptForText extends Prompt<string, PromptArgs, CustomContext> {

    validator = hasText;

    prompter = async () => {
        await this.send(this.context.foo);
        await this.send(this.state.args!.prompt!);
    }
}
PromptForText.register();

class Root extends Topic<any, any, any, CustomContext> {

    async onStart() {
        await this.startChild(Child);
    }

    async onDispatch() {
        if (this.text)
            await this.dispatchToChild();
    }

    async onChildEnd(child: Topic) {
        if (child instanceof Child) {
            await this.send(this.context.foo);
            await this.startChild(PromptForText, {
                prompt: 'Wassup?',
            });
        } else if (child instanceof PromptForText) {
            await this.send(`You said ${child.return!.result.value}`);
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