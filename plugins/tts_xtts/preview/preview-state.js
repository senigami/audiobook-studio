const SCHEMA = {
    "speed": { "type": "number", "default": 1.0, "min": 0.5, "max": 2.0 },
    "temperature": { "type": "number", "default": 0.75, "min": 0.01, "max": 1.0 },
    "repetition_penalty": { "type": "number", "default": 5.0, "min": 1.0, "max": 10.0 },
    "top_k": { "type": "integer", "default": 50, "min": 1, "max": 100 },
    "top_p": { "type": "number", "default": 0.85, "min": 0.01, "max": 1.0 },
    "safe_mode": { "type": "boolean", "default": true }
};

let currentState = {
    id: "xtts",
    enabled: true,
    status: "ready",
    message: "Engine is ready for synthesis.",
    last_verified: "2026-05-15T12:00:00Z",
    settings: {
        speed: 1.0,
        temperature: 0.75,
        repetition_penalty: 5.0,
        top_k: 50,
        top_p: 0.85,
        safe_mode: true
    },
    capabilities: ["synthesis", "preview", "voice_cloning"]
};

let harnessInputs = {
    text: "Hello from the CLI harness!",
    speaker_wav: "sample.wav",
    out: "output.wav"
};

// Load from localStorage if available
try {
    const saved = localStorage.getItem('xtts-harness-inputs');
    if (saved) {
        harnessInputs = { ...harnessInputs, ...JSON.parse(saved) };
    }
} catch (e) {
    console.warn("Failed to load harness inputs from localStorage", e);
}

function renderForm() {
    // Fill harness inputs
    document.getElementById('input-text').value = harnessInputs.text;
    document.getElementById('input-speaker_wav').value = harnessInputs.speaker_wav;
    document.getElementById('input-out').value = harnessInputs.out;

    const form = document.getElementById('settings-form');
    form.innerHTML = '';

    Object.entries(SCHEMA).forEach(([key, config]) => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = key.replace(/_/g, ' ').toUpperCase();
        group.appendChild(label);

        if (config.type === 'boolean') {
            const select = document.createElement('select');
            select.innerHTML = `<option value="true">True</option><option value="false">False</option>`;
            select.value = currentState.settings[key].toString();
            select.onchange = (e) => {
                currentState.settings[key] = e.target.value === 'true';
                update();
            };
            group.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = config.type === 'integer' ? '1' : '0.01';
            input.value = currentState.settings[key];
            input.oninput = (e) => {
                currentState.settings[key] = config.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
                update();
            };
            group.appendChild(input);
        }

        form.appendChild(group);
    });
}

function updateHarnessInput(key, value) {
    harnessInputs[key] = value;
    try {
        localStorage.setItem('xtts-harness-inputs', JSON.stringify(harnessInputs));
    } catch (e) {}
    update();
}

function setState(mode) {
    // Reset classes
    document.querySelectorAll('.state-controls button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${mode}`);
    if (btn) btn.classList.add('active');

    const badge = document.getElementById('badge');
    badge.className = 'status-badge';

    switch (mode) {
        case 'ready':
            currentState.status = 'ready';
            currentState.message = 'Engine is ready for synthesis.';
            badge.classList.add('badge-ready');
            badge.textContent = 'Ready';
            break;
        case 'needs_setup':
            currentState.status = 'needs_setup';
            currentState.message = 'Dependencies are missing. Run Install Deps to proceed.';
            badge.classList.add('badge-setup');
            badge.textContent = 'Needs Setup';
            break;
        case 'installing':
            currentState.status = 'installing';
            currentState.message = 'Installing coqui-tts and related packages...';
            badge.classList.add('badge-setup');
            badge.textContent = 'Installing';
            break;
        case 'error':
            currentState.status = 'error';
            currentState.message = 'Failed to load model: Out of VRAM.';
            badge.classList.add('badge-error');
            badge.textContent = 'Error';
            break;
        case 'verifying':
            currentState.status = 'verifying';
            currentState.message = 'Running verification synthesis with Default Voice...';
            badge.classList.add('badge-setup');
            badge.textContent = 'Verifying';
            break;
    }
    update();
}

function update() {
    document.getElementById('info-box').textContent = currentState.message;
    document.getElementById('state-json').textContent = JSON.stringify(currentState, null, 4);
    
    // Compose CLI command
    const cmd = [
        'python cli.py',
        `--text "${harnessInputs.text.replace(/"/g, '\\"')}"`,
        `--out "${harnessInputs.out}"`,
        harnessInputs.speaker_wav ? `--speaker-wav "${harnessInputs.speaker_wav}"` : '',
        `--speed ${currentState.settings.speed}`,
        !currentState.settings.safe_mode ? '--raw' : ''
    ].filter(Boolean).join(' ');
    
    document.getElementById('command-output').textContent = cmd;
}

function copyCommand() {
    const cmd = document.getElementById('command-output').textContent;
    navigator.clipboard.writeText(cmd).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
}

// Initial render
renderForm();
setState('ready');
