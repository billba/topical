import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, Culture, NumberPrompt, prettyConsole, WSTelemetry, Prompt, hasText, consoleOnTurn, doTopic } from '../src/topical';

class PromptForCulture extends Prompt<string, string> {

    validator = hasText
        .and((activity, text) => Culture.getSupportedCultureCodes().includes(text) || 'unsupported_culture');

    async prompter() {
        await this.context.sendActivity(this.state.args);
    }
}

class PromptForNumber extends NumberPrompt<string> {

    async prompter() {
        await this.context.sendActivity(this.state.args);
    }
}

class FavoriteNumber extends Topic  {

    static subtopics = [PromptForCulture, PromptForNumber];

    async onBegin() {
        await this.beginChild(PromptForCulture, {
            name: 'culture',
            args: `Please pick a culture (${Culture.getSupportedCultureCodes().join(', ')}).`,
        });
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;
        
        await this.context.sendActivity(`That's all I've got.`);
    }

    async onChildReturn(child: Topic) {
        if (child instanceof PromptForCulture) {
            await this.beginChild(PromptForNumber, {
                name: 'favoriteNumber',
                args: `What's your favorite number?`,
            }, {
                culture: child.return!.result.value!, 
            });
        } else if (child instanceof PromptForNumber) {
            await this.context.sendActivity(`${child.return!.result.value}? That's my favorite too!`);
            this.clearChildren();
        }
    }
}


// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

consoleOnTurn(
    new ConsoleAdapter()
        .use(prettyConsole),
    context => doTopic(FavoriteNumber, context)
);