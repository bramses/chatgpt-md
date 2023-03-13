


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
- (NEW!) *Infer title* from messages. Can be set to run automatically after >4 messages.
- (NEW!) Stream at cursor position or at end of file. Can be set in settings.

### Commands

#### Chat

The main command! Parses the file and calls ChatGPT. Recommended to add to a hotkey for easy usage.


#### Create New Chat with Highlighted Text

Take currently highlighted text and default frontmatter and create a new chat file in `Chat Folder`

#### Create New Chat From Template

Create a new chat file from a template specified in `Chat Template Folder`. Remember to check out [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates) for some templates!

#### (NEW!) Infer Title

Infer the title of the chat from the messages. Requires at least 2 messages. Can be set in settings to run automatically after >4 messages.

#### Add HR

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



## About the Developer

This repository was written by Bram Adams, a writer and programmer based out of NYC. 

Bram publishes a Zettelkasten with a twice/weekly newsletter, is a [community developer ambassador for OpenAI](https://platform.openai.com/ambassadors), and does freeleance contracts (for hire!) related to AI/web dev/AR+VR. 

Bram is also the creator of [Stenography](https://stenography.dev), an API and [VSC Extension](https://marketplace.visualstudio.com/items?itemName=Stenography.stenography) that automatically documents code on save. He also is the author of [Bramses' Highly Opinionated Vault](https://github.com/bramses/bramses-highly-opinionated-vault-2023), an extremely detailed philosophy + vault template used by hundreds of Obsidian users, new and old.

You can learn more about him and his work on his [website](https://www.bramadams.dev/about/). 

The best way to support his work is to sign up for his newsletter [here](https://www.bramadams.dev/#/portal/).
