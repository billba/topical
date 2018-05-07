import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, prettyConsole, Waterfall, consoleOnTurn, doTopic } from '../src/topical';

class KnockKnock extends Waterfall {

    waterfall() {
        return [
            () => this.send(`Who's there?`),

            () => this.send(`${this.text} who?`),

            () => this.send(`Hilarious!`),
        ];
    }

    // uses default onStart, onDispatch, onChildEnd
}
KnockKnock.register();

class Root extends Topic {

    async onStart () {
        await this.send(`Tell me a knock knock joke`);
    }

    async onDispatch () {
        if (!this.text)
            return;

        if (this.text === 'knock knock') {
            await this.startChild(KnockKnock);
            return;
        }

        if (await this.dispatchToChild())
            return;

        await this.send(`Please, just one knock knock joke is all I ask.`)
    }

    async onChildEnd (child: KnockKnock) {
        await this.send(`That was fun. Tell me another.`);
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