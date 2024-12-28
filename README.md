## Solstream

Launch livestreams paired with coins on pump.fun

[Project Architecture]

Our state management is a backend-driven approach: User Action → API Call → Backend → Socket Event → UI Update, while Media Layer (Agora) operates as independently as possible of application state.