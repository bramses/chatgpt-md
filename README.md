


# ChatGPT-MD

A (nearly) seamless integration of ChatGPT into Obsidian.

## Demo

![demo video](https://user-images.githubusercontent.com/3282661/223005882-6632c997-b9a6-445b-800c-77a4b76a6325.mov)

## Features

- Chat from *any* MD note
- Create Chat *Templates* for sharing and running similar scenarios. Check out the companion repo [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates) for some templates!
- Use *frontmatter* to change variables for the ChatGPT API
- *Stream* characters to Obsidian, creating a realtime feel
- Uses *regular Markdown*. Meaning everything from *lists* to *code blocks* from ChatGPT *will render*!
- Create chats from *highlighted text*.

### Commands

#### Chat

The main command! Parses the file and calls ChatGPT. Recommended to add to a hotkey for easy usage.


#### Create New Chat with Highlighted Text

Take currently highlighted text and default frontmatter and create a new chat file in `Chat Folder`

#### Create New Chat From Template

Create a new chat file from a template specified in `Chat Template Folder`. Remember to check out [chatgpt-md-templates](https://github.com/bramses/chatgpt-md-templates) for some templates!

#### Add HR

Add a ChatGPT MD Horizontal Rule and `role::user`. 

**!! Note: both `role::system|assistant|user` AND `<hr class="__chatgpt_plugin">` are REQUIRED for the plugin to work!!**

## Installation

1. Clone this repo into your `plugins` directory in your vault
2. Run `npm i` and `npm build`
3. Insert your OpenAI API Key into the settings
4. Set `Chat Folder` and `Chat Template Folder`
5. Add a hotkey for `Chat` (Im using `alt-[`)


## About the Developer

This repository was written by Bram Adams, a writer and programmer based out of NYC. 

Bram publishes a Zettelkasten with a twice/weekly newsletter, is a community developer ambassador for OpenAI, and does freeleance contracts (for hire!) related to AI/web dev/AR+VR. 

Bram is also the creator of [Stenography](https://stenography.dev), a API and [VSC Extension](https://marketplace.visualstudio.com/items?itemName=Stenography.stenography) that automatically documents code on save. He also is the author of [Bramses' Highly Opinionated Vault](https://github.com/bramses/bramses-highly-opinionated-vault-2023), an extremely detailed philosophy + vault template used by hundreds of Obsidian users, new and old.

You can learn more about him and his work on his [website](https://www.bramadams.dev/about/). 

The best way to support his work is to sign up for his newsletter [here](https://www.bramadams.dev/#/portal/).
