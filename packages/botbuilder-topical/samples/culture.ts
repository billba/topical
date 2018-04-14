import { MemoryStorage, ConsoleAdapter } from 'botbuilder';
import { Topic, Culture, NumberPrompt, TopicWithChild, prettyConsole, WSTelemetry, Prompt, hasText } from '../src/topical';

// const wst = new WSTelemetry('ws://localhost:8080/server');
// Topic.telemetry = action => wst.send(action);

Topic.init(new MemoryStorage());

const adapter = new ConsoleAdapter();

adapter
    .use(prettyConsole)
    .listen(async context => {
        await FavoriteNumber.do(context);
    });

class PromptForCulture extends Prompt<string, string> {

    validator = hasText
        .and((activity, value) => Culture.getSupportedCultureCodes().includes(value)
            ? { value }
            : { reason: 'unsupported_culture' }
        );

    async prompter() {
        await this.context.sendActivity(this.state.args);
    }
}

class PromptForNumber extends NumberPrompt<string> {

    async prompter() {
        await this.context.sendActivity(this.state.args);
    }
}

class FavoriteNumber extends TopicWithChild  {

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
                culture: child.return.result.value, 
            });

        } else if (child instanceof PromptForNumber) {

            await this.context.sendActivity(`${child.return.result.value}? That's my favorite too!`);
            this.clearChild();
        }
    }
}
