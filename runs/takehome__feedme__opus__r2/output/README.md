## FeedMe Software Engineer Take Home Assignment
Below is a take home assignment before the interview of the position. You are required to
1. Understand the situation and use case. You may contact the interviewer for further clarification.
2. implement the requirement with **either frontend or backend components**.
3. Complete the requirement with **AI** if possible, but perform your own testing.
4. Provide documentation for the any part that you think is needed.
5. Bring the source code and functioning prototype to the interview session.

### Situation
McDonald is transforming their business during COVID-19. They wish to build the automated cooking bots to reduce workforce and increase their efficiency. As one of the software engineer in the project. You task is to create an order controller which handle the order control flow. 

### User Story
As below is part of the user story:
1. As McDonald's normal customer, after I submitted my order, I wish to see my order flow into "PENDING" area. After the cooking bot process my order, I want to see it flow into to "COMPLETE" area.
2. As McDonald's VIP member, after I submitted my order, I want my order being process first before all order by normal customer.  However if there's existing order from VIP member, my order should queue behind his/her order.
3. As McDonald's manager, I want to increase or decrease number of cooking bot available in my restaurant. When I increase a bot, it should immediately process any pending order. When I decrease a bot, the processing order should remain un-process.
4. As McDonald bot, it can only pickup and process 1 order at a time, each order required 10 seconds to complete process.

### Requirements
1. When "New Normal Order" clicked, a new order should show up "PENDING" Area.
2. When "New VIP Order" clicked, a new order should show up in "PENDING" Area. It should place in-front of all existing "Normal" order but behind of all existing "VIP" order.
3. The order number should be unique and increasing.
4. When "+ Bot" clicked, a bot should be created and start processing the order inside "PENDING" area. after 10 seconds picking up the order, the order should move to "COMPLETE" area. Then the bot should start processing another order if there is any left in "PENDING" area.
5. If there is no more order in the "PENDING" area, the bot should become IDLE until a new order come in.
6. When "- Bot" clicked, the newest bot should be destroyed. If the bot is processing an order, it should also stop the process. The order should return to its original position in the "PENDING" area (maintaining VIP/Normal order priority).
7. No data persistance is needed for this prototype, you may perform all the process inside memory.

### Functioning Prototype
You must implement **either** frontend or backend components as described below:

#### 1. Frontend
- You are free to use **any framework and programming language** of your choice
- The UI application must be compiled, deployed and hosted on any publicly accessible web platform
- Must provide a user interface that demonstrates all the requirements listed above
- Should allow users to interact with the McDonald's order management system

#### 2. Backend
- You must use **either Go (Golang) or Node.js** for the backend implementation
- The backend must be a CLI application that can be executed in GitHub Actions
- Must implement the following scripts in the `script` directory:
  - `test.sh`: Contains unit test execution steps
  - `build.sh`: Contains compilation steps for the CLI application
  - `run.sh`: Contains execution steps that run the CLI application
- The CLI application result must be printed to `result.txt`
- The `result.txt` output must include timestamps in `HH:MM:SS` format to track order completion times
- Must follow **GitHub Flow**: Create a Pull Request with your changes to this repository
- Ensure all GitHub Action checks pass successfully
- **Note**: An interactive CLI implementation is compulsory for the next round of interview. Candidates should be prepared to demonstrate interactive command handling.

#### Submission Requirements
- Fork this repository and implement your solution with either frontend or backend
- **Frontend option**: Deploy to a publicly accessible URL using any technology stack
- **Backend option**: Must be implemented in Go or Node.js and work within the GitHub Actions environment
  - Follow GitHub Flow process with Pull Request submission
  - All tests in `test.sh` must pass
  - The `result.txt` file must contain meaningful output from your CLI application
  - All output must include timestamps in `HH:MM:SS` format to track order completion times
  - Submit a Pull Request and ensure the `backend-verify-result` workflow passes
- Provide documentation for any part that you think is needed

### Tips on completing this task
- Testing, testing and testing. Make sure the prototype is functioning and meeting all the requirements.
- Utilize coding agent to complete the assignment scope your working hour within 1 hour, do not over engineer it. However, ensure you read and understand what your code doing and apply good engineering practice.
- Complete the implementation as clean as possible, clean code is a strong plus point, do not bring in all the fancy tech stuff.

---

## Solution: Order Controller (Node.js CLI)

No runtime dependencies. Needs Node.js 22 or newer. Everything is kept in memory.

### Running it

| Command | What it does |
|---|---|
| `npm start` | **Interactive CLI**: type commands and watch bots process orders live |
| `npm run simulate` | Scripted real-time demo (~32s) that covers every requirement |
| `npm test` | Unit tests (`node:test`, mocked timers, so they run instantly) |
| `./scripts/test.sh` / `build.sh` / `run.sh` | CI entry points. `run.sh` writes `scripts/result.txt` |

Interactive commands: `n`/`normal`, `v`/`vip`, `+`/`+bot`, `-`/`-bot`, `s`/`status`, `h`/`help`, `q`/`quit`.

### Layout

```
src/
  OrderController.js  core domain logic: pending queue, bots, dispatching
  logger.js           [HH:MM:SS] timestamps + status formatting
  simulation.js       scripted scenario used by run.sh -> result.txt
  interactive.js      readline-based interactive CLI
  index.js            entry point (--simulate or interactive)
test/
  OrderController.test.js
```

### Design notes

- **One pending queue, one ordering rule.** `PENDING` is kept sorted by *(VIP before Normal, then order number)*. Order numbers only increase, so this one comparator:
  - puts a new VIP order behind existing VIPs and ahead of all Normal orders, and
  - puts an order dropped by a removed bot back in its **original position**.
- **Dispatching** runs whenever something changes (new order, new bot, bot finished). Every idle bot takes the next pending order.
- **Bots** are kept in creation order. `- Bot` removes the newest one with `pop()`. If that bot is busy, its timer is cancelled and the order goes back to `PENDING`. When a bot picks the order up again, it takes the full 10 seconds.
- **Output is separate from logic.** The controller reports state changes through an `onEvent(message)` callback. The simulation, the interactive CLI and the tests each decide how to show them.

### Assumptions

- Order numbers start at 1001, as in the sample output. Bot IDs are never reused.
- An interrupted order starts its 10 seconds over. Partial progress is not kept.
- Removing a bot when there are none does nothing and logs a message.
