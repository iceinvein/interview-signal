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

## Solution: Order Controller CLI (Node.js)

Plain Node.js (>= 22), **no dependencies**. Everything runs in memory.

### Usage

```bash
npm start            # interactive CLI
npm run simulate     # scripted real-time demo (what scripts/run.sh writes to scripts/result.txt)
npm test             # unit tests (node:test with mocked timers)
```

Interactive commands:

| Command | Action |
|---|---|
| `n` / `normal` | New Normal Order |
| `v` / `vip` | New VIP Order |
| `+` / `+bot` | Add a bot |
| `-` / `-bot` | Remove the newest bot |
| `s` / `status` | Show PENDING, COMPLETE and bots |
| `h` / `help` | Help |
| `q` / `quit` | Exit |

Every output line starts with a `[HH:MM:SS]` timestamp.

### Project layout

```
src/orderController.js   Core logic: order queue, bots, timers (no I/O)
src/logger.js            [HH:MM:SS] timestamped logger
src/cli.js               Interactive readline CLI
src/simulate.js          Fixed demo scenario used by scripts/run.sh
test/                    Unit tests
scripts/                 test.sh / build.sh / run.sh used by GitHub Actions
```

### Design notes

- **Priority queue**: `pending` is kept sorted by `(priority, id)`, where VIP comes before Normal. A new order has the highest id, so it goes behind every order of its own type (req. 2). An order handed back by a removed bot keeps its original id, so the same insert puts it back in its original position (req. 6).
- **Order numbers** start at 1001. They are unique and always increasing (req. 3).
- **Bots**: each bot holds at most one order and a `setTimeout` of 10s (req. 4). When the timer fires, the order moves to COMPLETE and the bot takes the next pending order. If there is none, it goes IDLE (req. 5). Adding a bot or an order triggers `dispatch()`, which gives pending orders to idle bots, oldest bot first.
- **Removing a bot** removes the newest bot. If it was busy, its timer is cancelled and the order goes back to PENDING (req. 6). Another bot then processes that order for the full 10 seconds again.
- The controller only reports output through an injected `log` callback. This keeps it I/O-free, so the same code runs the CLI, the simulation and the tests.
