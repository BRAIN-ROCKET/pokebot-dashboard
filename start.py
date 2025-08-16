import os
import sys
import subprocess
from pathlib import Path


def main() -> int:
    project_dir = Path(__file__).resolve().parent
    venv_dir = project_dir / ".venv"

    # 1) Ensure virtual environment exists
    if not venv_dir.exists():
        print("Creating virtual environment ...", flush=True)
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)

    # 2) Resolve interpreter inside venv
    if os.name == "nt":
        python_bin = venv_dir / "Scripts" / "python.exe"
    else:
        python_bin = venv_dir / "bin" / "python"

    # 3) Install/upgrade dependencies
    print("Installing dependencies ...", flush=True)
    subprocess.run([str(python_bin), "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([str(python_bin), "-m", "pip", "install", "-r", str(project_dir / "requirements.txt")], check=True)

    # 4) Launch the app
    print("Starting dashboard ...", flush=True)
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    # Port is read from conf.yml inside app.py (dashboard-port), can be overridden by PORT env var.
    subprocess.run([str(python_bin), str(project_dir / "app.py")], check=True, cwd=project_dir, env=env)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


