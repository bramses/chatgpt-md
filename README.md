


# ChatGPT-MD

A (nearly) seamless integration of ChatGPT into Obsidian.

## Demo

https://user-images.githubusercontent.com/3282661/223005882-6632c997-b9a6-445b-800c-77a4b76a6325.mov

### (youtube mirror - for mobile users ⬇️)

[![video thumbnail](video-thumbnail.png)](https://youtu.be/CxDlol_DDI8)

## Features

- Chat from *any* MD note
- Create Chat *Templates* for sharing and running similar scenarios. Check out the companion repo [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates) for some templates!
- As *minimal boilerplate as possible*, only two required in fact! `<hr class="__chatgpt_plugin">` and `role::system|assistant|user`
- Use *frontmatter* to change variables for the ChatGPT API
- *Stream* characters to Obsidian, creating a realtime feel
- Uses *regular Markdown*. Meaning everything from *lists* to *code blocks* from ChatGPT *will render*!
- Create chats from *highlighted text*.
- [*Infer title* from messages](https://github.com/bramses/chatgpt-md/discussions/11). Can be set to run automatically after >4 messages.
- Stream at cursor position or at end of file. Can be set in settings.
- Choose [heading level for role](https://github.com/bramses/chatgpt-md/pull/22) h1-h6. Can be set in settings.
- Custom endpoints can be specified using the url parameter in your front matter. See FAQ for an example.
- Stop a running stream with a command. See commands section below.
- (NEW!) Choose between nine languages for "Infer Title". Can be set in settings.
- (NEW!) ChatGPT comment blocks. Allows you to leave scratchpad notes, backlinks...or anything else really!! See command below for details.

### Commands

#### Chat

The main command! Parses the file and calls ChatGPT. Recommended to add to a hotkey for easy usage.


#### Create New Chat with Highlighted Text

Take currently highlighted text and default frontmatter and create a new chat file in `Chat Folder`

#### Create New Chat From Template

Create a new chat file from a template specified in `Chat Template Folder`. Remember to check out [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates) for some templates!

#### Infer Title

[Infer the title of the chat from the messages](https://github.com/bramses/chatgpt-md/discussions/11). Requires at least 2 messages. Can be set in settings to run automatically after >4 messages.

#### Add comment block

Add a comment block to the editor that will not be processed by ChatGPT. Allows you to leave scratchpad notes, backlinks...or anything else really!

Comments begin with `=begin-chatgpt-md-comment` and end with `=end-chatgpt-md-comment`

![Screenshot 2023-04-03 16-47-05](https://user-images.githubusercontent.com/3282661/229628591-eda70076-9e03-44e3-98b5-16be73f39957.png)
![Screenshot 2023-04-03 16-59-26](https://user-images.githubusercontent.com/3282661/229628629-2fc9ec19-7cce-4754-9c09-11f2364395e5.png)

#### Clear Chat

Removes all messages but leaves frontmatter

#### Stop Streaming (Does not work on mobile)

Stops the stream. Useful if you want to stop the stream if you don't like where ChatGPT is heading/going too long.

#### Add Divider

Add a ChatGPT MD Horizontal Rule and `role::user`. 

**!! Note: both `role::system|assistant|user` AND `<hr class="__chatgpt_plugin">` are REQUIRED for the plugin to work!!**

## Installation

### Community Plugins

Go to Community Plugins and search `ChatGPT MD`

### Local

1. Clone this repo into your `plugins` directory in your vault
2. Run `npm i` and `npm run build`

### Both

1. Insert your OpenAI API Key into the settings
2. Set `Chat Folder` and `Chat Template Folder`
3. Add a hotkey for `Chat` (Im using `alt-[`)

## FAQ

### Q: The chat seems to be getting cut off halfway through

To address this, first try to increase your `max_tokens` (default is set to 300). You may also want to update it more permanently in the default frontmatter settings. See pics below:

![Screenshot 2023-03-12 16-14-35](https://user-images.githubusercontent.com/3282661/224571118-080ca393-6f94-4a20-ba98-27bc8b8b6ad2.png)
![Screenshot 2023-03-12 16-15-01](https://user-images.githubusercontent.com/3282661/224571119-cba1be45-3ab1-4b86-b056-ba596bacd918.png)

### Q: Code Blocks cut off halfway through and leave \`\`\`

The Obsidian editor renders backticks in automatically (see [issue](https://github.com/bramses/chatgpt-md/issues/15#issuecomment-1466813500)) and fires extra logic that causes the stream to add extra backticks. To address this, you can:

1. at the end of the code block add \`\`\` (three backticks) to close the code block BEFORE the `<hr>` and delete the three extra Obsidian added automatically.
2. in `role::user` write "keep going"

See pics below:

![Screenshot 2023-03-15 18-47-40](https://user-images.githubusercontent.com/3282661/225460844-54101bf2-d5ac-4725-95b5-c79bf6b6ed6a.png)
![Screenshot 2023-03-15 18-48-30](https://user-images.githubusercontent.com/3282661/225460845-6ff12c98-ea74-4ae8-bc2d-4161e89acdda.png)


### Q: How do I use GPT-4?

If you are off the [waitlist](https://openai.com/waitlist/gpt-4-api), simply replace `model: gpt-3.5-turbo` with `model: gpt-4` in the frontmatter. (*note: gpt-4 is slower than turbo!*)

### Q: How do I use a custom endpoint?

```md
---
system_commands: ['I create small self contained app ideas that could fit in a CodePen or a Replit']
url: https://localhost
---
```

The custom API must conform to the OpenAI API spec. eg you could use Azure's OpenAI hosted endpoints here. Refer to your provider for API key handling.

## About the Developer

This repository was written by Bram Adams, a writer and programmer based out of NYC. 

Bram publishes a weekly newsletter, is a [community developer ambassador for OpenAI](https://platform.openai.com/ambassadors), and does freeleance contracts ([for hire!](https://www.bramadams.dev/consulting/)) related to AI/web dev/AR+VR. 

As of Fall 2023, Bram is actively working on [Commonplace Bot](https://github.com/bramses/commonplace-bot), a novel and modern look into how LLMs and creative coding can help us capture, engage, and creatively remix the best pieces of information we come across. You can test it out live in the Bram Adams' [Discord server](https://discord.gg/GrgkFP3Je3).

Bram is the creator of [Stenography](https://stenography.dev), an API and [VSC Extension](https://marketplace.visualstudio.com/items?itemName=Stenography.stenography) that automatically documents code on save, which went [#1 on Product Hunt](https://www.producthunt.com/products/stenography#stenography). He also is the author of [Bramses' Highly Opinionated Vault](https://github.com/bramses/bramses-highly-opinionated-vault-2023), an extremely detailed philosophy + vault template used by thousands of Obsidian users (new and old!), and [ChatGPT MD](https://github.com/bramses/chatgpt-md), a (nearly) seemless integration of Chat GPT into Obsidian which has been downloaded by over twenty thousand Obsidian users. He also taught the [GPT-3 in Production Course for O'Reilly Media](https://www.oreilly.com/live-events/gpt-3-in-production/0636920065944/0636920071443/), teaching students how to leverage LLMs in the real world of production.

Previously Developer Advocate @ [Algolia](https://www.algolia.com/), Software Engineer @ [HBO](https://www.hbo.com/), Computer Science B.S. @ [University of Rochester](https://rochester.edu/)

You can learn more about him and his work on his [website](https://www.bramadams.dev/about/). 

The best way to support his work is to sign up for his newsletter [here](https://www.bramadams.dev/#/portal/).
