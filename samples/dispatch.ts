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
        await this.createChild(Confirm);
    }

    async onDispatch() {
        if (!this.text)
            return;

        const matches = /confirm (.*)/i.exec(this.text);
        if (matches) {
            this.state = {
                ... this.context.activity,
                text: matches[1],
            };

            await this.startChild(Confirm, {
                prompt: `Are you sure you want to say "${matches[1]}"?`,
                reprompt: `I can accept "yes" or "no".`,
            });
            return;
        }

        await this.dispatchToChild(Confirm, Echo);
    }

    async onChildEnd(child: Confirm) {
        await this.dispatchToChild(this.state, Echo);
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