import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, Culture, NumberPrompt, prettyConsole, WSTelemetry, Prompt, hasText, consoleOnTurn, doTopic, PromptArgs } from '../src/topical';

async function prompter (
    this: Prompt<any, string>
) {
    await this.send(this.state.args!);
}

class PromptForCulture extends Prompt<string> {

    validator = hasText
        .and((activity, text) => Culture.getSupportedCultureCodes().includes(text) || 'unsupported_culture');
}

class FavoriteNumber extends Topic  {

    static subtopics = [PromptForCulture, NumberPrompt];

    async onBegin() {
        await this.beginChild(PromptForCulture, {
            prompt: `Please pick a culture (${Culture.getSupportedCultureCodes().join(', ')}).`
        } as PromptArgs);
    }

    async onTurn() {
        if (await this.dispatchToChild())
            return;
        
        await this.send(`That's all I've got.`);
    }

    async onChildReturn(child: Topic) {
        if (child instanceof PromptForCulture) {
            await this.beginChild(NumberPrompt, {
                prompt: `What's your favorite number?`
            }, {
                culture: child.return!.result.value!, 
            });
        } else if (child instanceof NumberPrompt) {
            await this.send(`${child.return!.result.value}? That's my favorite too!`);
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