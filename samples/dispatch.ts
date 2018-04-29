import { TurnContext, MemoryStorage, ConsoleAdapter, Activity } from 'botbuilder';
import { Topic, prettyConsole, WSTelemetry, consoleOnTurn, doTopic, Prompt, hasText, PromptArgs } from '../src/topical';

class Echo extends Topic {

    async onDispatch() {
        await this.send(`You said ${this.text}`);
    }
}
Echo.register();

class Confirm extends Prompt<boolean> {
    
    validator = hasText
        .transform<boolean>((activity, text) =>
            /yes/i.test(text) ? true :
            /no/i.test(text) ? false :
            { reason : 'not_yes_or_no' }
        );
}
Confirm.register();

class EchoWithConfirm extends Topic<any, Activity> {

    async onStart() {
        await this.startChild(Echo);
    }

    async onDispatch() {
        if (this.children.length !== 2 && this.text) {
            const x = /confirm (.*)/i.exec(this.text);
            if (x) {
                this.state = {
                    ... this.context.activity,
                    text: x[1],
                };

                this.children[1] = (await this.createTopicInstanceAndStart(Confirm, {
                    prompt: `Are you sure you want to say "${x[1]}"?`,
                    reprompt: `I can accept "yes" or "no".`,
                } as PromptArgs))!.topicInstanceName;
                return;
            }
        }

        await this.dispatchTo(this.children[this.children.length - 1]);
    }

    async onChildReturn(child: Confirm) {
        this.removeChild(child.topicInstanceName);
        await this.dispatchTo(this.children[0], this.state);
    }
}
EchoWithConfirm.register();

class Root extends Topic {

    async onStart() {
        await this.send(`What do you want to say?`)
        await this.startChild(EchoWithConfirm);
    }

    async onDispatch() {
        await this.dispatchToChild();
    }
}
Root.register();


// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(Root, context)
);