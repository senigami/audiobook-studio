const SCHEMA = {
    "mistral_api_key": { "type": "string", "default": "", "format": "password" },
    "model": { "type": "string", "default": "mistral-tts-latest", "enum": ["mistral-tts-latest", "mistral-tts-1", "mistral-tts-1-hd", "voxtral-mini-tts-2603"] },
    "output_format": { "type": "string", "default": "wav", "enum": ["wav", "mp3"] }
};

let currentState = {
    id: "voxtral",
    enabled: true,
    status: "ready",
    message: "Voxtral is ready for cloud synthesis.",
    last_verified: "2026-05-15T12:00:00Z",
    settings: {
        mistral_api_key: "sk-****************",
        model: "mistral-tts-latest",
        output_format: "wav"
    },
    capabilities: ["synthesis", "preview"]
};

let harnessInputs = {
    text: "Hello from the Voxtral developer harness!",
    ref_audio: "voice.wav",
    out: "output.wav"
};

// Load from localStorage if available
try {
    const saved = localStorage.getItem('voxtral-harness-inputs');
    if (saved) {
        harnessInputs = { ...harnessInputs, ...JSON.parse(saved) };
    }
} catch (e) {
    console.warn("Failed to load harness inputs from localStorage", e);
}

function renderForm() {
    // Fill harness inputs
    document.getElementById('input-text').value = harnessInputs.text;
    document.getElementById('input-ref_audio').value = harnessInputs.ref_audio;
    document.getElementById('input-out').value = harnessInputs.out;

    const form = document.getElementById('settings-form');
    form.innerHTML = '';

    Object.entries(SCHEMA).forEach(([key, config]) => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = key.replace(/_/g, ' ').toUpperCase();
        group.appendChild(label);

        if (config.enum) {
            const select = document.createElement('select');
            config.enum.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                select.appendChild(o);
            });
            select.value = currentState.settings[key];
            select.onchange = (e) => {
                currentState.settings[key] = e.target.value;
                update();
            };
            group.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.type = config.format === 'password' ? 'password' : 'text';
            input.value = currentState.settings[key];
            input.oninput = (e) => {
                currentState.settings[key] = e.target.value;
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
        localStorage.setItem('voxtral-harness-inputs', JSON.stringify(harnessInputs));
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
            currentState.message = 'Voxtral is ready for cloud synthesis.';
            badge.classList.add('badge-ready');
            badge.textContent = 'Ready';
            break;
        case 'missing_key':
            currentState.status = 'needs_setup';
            currentState.message = 'Mistral API key is missing. Add a key to enable synthesis.';
            badge.classList.add('badge-setup');
            badge.textContent = 'Needs Setup';
            break;
        case 'error':
            currentState.status = 'error';
            currentState.message = 'API Error: 401 Unauthorized. Check your API key.';
            badge.classList.add('badge-error');
            badge.textContent = 'Error';
            break;
        case 'verifying':
            currentState.status = 'verifying';
            currentState.message = 'Verifying API connectivity and model access...';
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
        currentState.settings.mistral_api_key && !currentState.settings.mistral_api_key.includes('*') ? `--api-key "${currentState.settings.mistral_api_key}"` : '',
        currentState.settings.model ? `--model "${currentState.settings.model}"` : '',
        harnessInputs.ref_audio ? `--ref-audio "${harnessInputs.ref_audio}"` : ''
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
