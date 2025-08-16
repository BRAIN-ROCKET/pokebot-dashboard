# PokéBot Gen3 Dashboard (HTTP Web UI)

This is a simple, cross-platform web UI that connects to the PokéBot Gen3 HTTP API and serves a real-time dashboard in your browser. It does not run the bot; it only visualizes the data and video stream provided by a running PokéBot Gen3 instance.
<img width="1574" height="896" alt="40f1f443403a13dc648753ddcd9a673d" src="https://github.com/user-attachments/assets/edd92d42-738f-479d-bd1c-e25fc52f3c19" />

## Features
- Live video stream (proxied to the browser) with sharp pixel scaling
- Encounters/hour chart, FPS, phase and total counters, shiny count, runtime
- Pokémon stats for Opponent, Party, and Shiny Log
- Map encounters table
- Instant controls (emulation speed, bot mode, video/audio) with auto-apply


## Requirements
- Python 3.10+ recommended
- An accessible PokéBot Gen3 HTTP API (running elsewhere on your LAN or machine)

## Quick Start
1. Clone this repository:
   - `git clone https://github.com/BRAIN-ROCKET/pokebot-dashboard`
   - `cd pokebot-dashboard`
2. Ensure your PokéBot Gen3 is running and its HTTP API is reachable.
3. Edit `conf.yml` to set IPs and ports:
   - `bot-ip`: IP or hostname of the PokéBot Gen3 API (default 127.0.0.1 if running on the same box)
   - `bot-port`: Port of the PokéBot Gen3 API (default 8888)
   - `dashboard-port`: Desired port for the dashboard (defaults to 80)
4. Start the dashboard:
   - `python start.py`
5. Open in a browser: `http://<dashboardIP>:<dashboard-port>`

## Configuration
`conf.yml` example:
```yaml
dashboard-port: 80
bot-ip: "127.0.0.1"
bot-port: 8888
```
Environment overrides:
- `PORT`: overrides `dashboard-port`
- `HOST`: bind address (default `0.0.0.0`)

## Credits
This dashboard is an independent UI that consumes the PokéBot Gen3 HTTP API. For the bot itself, profiles, and full documentation, see the original [PokéBot Gen3](https://github.com/40Cakes/pokebot-gen3) project by 40Cakes and the [PokéBot Gen3 wiki](https://github.com/40Cakes/pokebot-gen3/tree/main/wiki).

## License

No license, use all the provide code in any way for personal or commercial use!
