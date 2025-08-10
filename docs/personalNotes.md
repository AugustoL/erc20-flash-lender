# Personal Notes

The idea of this personal note is to record my experience from having an idea and using AI to make an MVP from it. I used Claude 4.0 & 4.1 (with Anthropic subscription) and the free OpenAI ChatGPT 4.0.

### 5/8/2025
The project started after brainstorming with ChatGPT about flash loans and how to make a fun project with it. Thus, the idea of a platform where you can easily deposit any ERC20 token to be used for flash loans.

### 7/8/2025
The first version was submitted to GitHub after a day of work, with tests and documentation, looking pretty solid. BUT I have to recognize that I had to intervene multiple times and fix bugs that the AI agents weren't picking up. Nevertheless, I am amazed by how much I was able to advance. I think reaching this amount of code with this quality would have taken me 2-3 weeks in the past, and I was able to do this in just one day.
I'm feeling pretty confident about the code quality, but now I will do a more intense personal review, plus audits by AI agents, using deep research options to focus more on finding vulnerabilities and code optimizations.

### 10/8/2025

Well, I have been adding a lot of code since the last update to the notes. GPT-5 was released and I have to agree with most of the devs on Reddit - it is not better than Claude Sonnet/Opus for coding, although it helped me a lot chatting about the project and deciding the next steps. I guess I am using GPT for "macro" development product decisions and Claude for coding them.

First, I focused on getting good quality code in terms of security and readability on the main lender contract, then I figured out that an Executor contract would be a great addition - something super efficient and easy to use. After I got that done, I focused on making the tests easier to read and getting good coverage there.

Once I had a full use case done for executing one flash loan, I added support for multiple ones.

After that, I added an integration test that arbitrates on UniV2 pairs.

Yesterday I was also talking with GPT about the project and taking a look at competitors and oh man - they have a lot of code! That is definitely not the direction that I want to take with this. I want to have as little code as possible on-chain. Less code equals less complexity, which makes it safer in a way, since it is easier to audit and understand what's happening. I've decided that I will focus on having as little code as possible - efficient and simple - with the minimal needs to execute any atomic DeFi operation. That will be the main strength of the project.