import { TurnContext, MemoryStorage, ConsoleAdapter, Activity } from 'botbuilder';
import { Topic, prettyConsole, WSTelemetry, consoleOnTurn, doTopic, Prompt, hasText, PromptArgs, ChoicePrompt, ChoicePromptArgs } from '../src/topical';

class Root extends Topic {

    async onStart() {
        await this.next();
    }

    async next() {
        await this.startChild(ChoicePrompt, {
            prompt: 'pick',
            reprompt: 'please pick',
        } as ChoicePromptArgs, {
            choices: ['one', 'two', 'three'],
        });        
    }

    async onDispatch() {
        if (this.text)
            await this.dispatchToChild();
    }

    async onChildReturn(child: ChoicePrompt) {
        await this.send(`You picked "${child.return!.result.value!.value}".`)
        await this.next();
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