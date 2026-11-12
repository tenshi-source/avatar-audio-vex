const avatarImage = document.getElementById('avatarImage');
const toggleMicrophoneButton = document.getElementById('toggleMicrophone');
const toggleObsUiButton = document.getElementById('toggleObsUi');
const stopMicrophoneButton = document.getElementById('stopMicrophone');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const sensitivityValue = document.getElementById('sensitivityValue');
const statusBadge = document.getElementById('statusBadge');
const silentInput = document.getElementById('silentInput');
const activeInput = document.getElementById('activeInput');
const obsAuthForm = document.getElementById('obsAuthForm');
const obsPasswordInput = document.getElementById('obsPasswordInput');
const cancelObsAuthButton = document.getElementById('cancelObsAuth');
const obsInputForm = document.getElementById('obsInputForm');
const obsInputSelect = document.getElementById('obsInputSelect');

const obsMode = new URLSearchParams(window.location.search).get('obs') === '1';
const defaultSilentImage = 'assets/silent-avatar.png';
const defaultActiveImage = 'assets/sound-avatar.png';

const state = {
  isListening: false,
  stream: null,
  audioContext: null,
  analyser: null,
  dataArray: null,
  animationFrame: null,
  obsSocket: null,
  obsRequestId: null,
  cancelObsPasswordPrompt: null,
  cancelObsInputPrompt: null,
  obsInputName: null,
  silentSource: defaultSilentImage,
  activeSource: defaultActiveImage,
};

if (obsMode) {
  document.body.classList.add('obs-mode');
} else {
  toggleObsUiButton.hidden = true;
  stopMicrophoneButton.hidden = true;
}

function toggleObsUi() {
  const isHidden = document.body.classList.toggle('obs-ui-hidden');
  toggleObsUiButton.setAttribute('aria-pressed', String(isHidden));
  toggleObsUiButton.textContent = isHidden ? 'Mostrar controles' : 'Ocultar controles';
}

function setAvatar(source, isSpeaking = false) {
  avatarImage.src = source;
  avatarImage.classList.toggle('active', isSpeaking);
}

function updateSensitivityLabel() {
  sensitivityValue.textContent = sensitivitySlider.value;
}

function setStatus(mode, message) {
  statusBadge.className = 'status-badge';

  if (mode === 'requesting') {
    statusBadge.textContent = obsMode ? 'Conectando ao OBS...' : 'Solicitando acesso ao microfone...';
    statusBadge.classList.add('requesting');
  } else if (mode === 'error') {
    statusBadge.textContent = message;
    statusBadge.classList.add('error');
  } else if (mode === 'listening') {
    statusBadge.textContent = 'Ouvindo';
    statusBadge.classList.add('listening');
  } else if (mode === 'active') {
    statusBadge.textContent = 'Som detectado';
    statusBadge.classList.add('active');
  } else {
    statusBadge.textContent = 'Desligado';
    statusBadge.classList.add('idle');
  }
}

function getMicrophoneErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    return 'Acesso ao microfone bloqueado. Verifique a permissão do OBS e do Windows.';
  }

  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado.';
  }

  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'O microfone está ocupado ou indisponível.';
  }

  if (error?.name === 'SecurityError' || error?.name === 'TypeError') {
    return 'O OBS não liberou o microfone para esta fonte. Verifique as permissões do Browser Source.';
  }

  return `Falha no microfone: ${error?.message || 'erro desconhecido'}`;
}

function getObsErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'O navegador bloqueou a conexão WebSocket. Confira o endereço e as permissões do servidor OBS.';
  }

  return `Falha na conexão com o OBS: ${error?.message || 'verifique se o WebSocket está ativo na porta 4455.'}`;
}

async function createObsAuthentication(password, salt, challenge) {
  if (!window.crypto?.subtle) {
    throw new Error('A criptografia necessária para autenticar no OBS não está disponível.');
  }

  const encoder = new TextEncoder();
  const hash = async (value) => {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  };

  const secret = await hash(password + salt);
  return hash(secret + challenge);
}

function requestObsPassword() {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      obsAuthForm.removeEventListener('submit', onSubmit);
      cancelObsAuthButton.removeEventListener('click', onCancel);
      obsAuthForm.hidden = true;
      document.body.classList.remove('obs-auth-required');
      obsPasswordInput.value = '';
      state.cancelObsPasswordPrompt = null;
    };

    const onSubmit = (event) => {
      event.preventDefault();
      const password = obsPasswordInput.value;
      cleanup();
      resolve(password);
    };

    const onCancel = () => {
      cleanup();
      reject(new Error('Conexão cancelada: a senha do WebSocket não foi informada.'));
    };

    state.cancelObsPasswordPrompt = (error) => {
      cleanup();
      reject(error);
    };
    obsAuthForm.addEventListener('submit', onSubmit);
    cancelObsAuthButton.addEventListener('click', onCancel);
    obsAuthForm.hidden = false;
    document.body.classList.add('obs-auth-required');
    obsPasswordInput.focus();
  });
}

function requestObsInputName(inputs) {
  return new Promise((resolve, reject) => {
    obsInputSelect.replaceChildren(new Option('Selecione uma fonte...', ''));
    for (const input of inputs) {
      obsInputSelect.add(new Option(input.inputName, input.inputName));
    }

    const cleanup = () => {
      obsInputForm.removeEventListener('submit', onSubmit);
      obsInputForm.hidden = true;
      document.body.classList.remove('obs-input-required');
      state.cancelObsInputPrompt = null;
    };

    const onSubmit = (event) => {
      event.preventDefault();
      if (!obsInputSelect.value) {
        obsInputSelect.focus();
        return;
      }

      const inputName = obsInputSelect.value;
      cleanup();
      resolve(inputName);
    };

    state.cancelObsInputPrompt = (error) => {
      cleanup();
      reject(error);
    };
    obsInputForm.addEventListener('submit', onSubmit);
    obsInputForm.hidden = false;
    document.body.classList.add('obs-input-required');
    obsInputSelect.focus();
  });
}

function getObsInputLevel(inputs) {
  const input = inputs?.find((item) => item.inputName === state.obsInputName);
  if (!Array.isArray(input?.inputLevelsMul)) {
    return null;
  }

  const levels = input.inputLevelsMul.flat(Infinity).filter(Number.isFinite);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

function connectToObs() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let identified = false;
    const socket = new WebSocket('ws://127.0.0.1:4455');
    state.obsSocket = socket;

    const timeout = window.setTimeout(() => {
      fail(new Error('Tempo esgotado. Verifique se o servidor WebSocket do OBS está ativo na porta 4455.'));
    }, 30000);

    function finish() {
      if (settled) {
        return false;
      }

      settled = true;
      window.clearTimeout(timeout);
      return true;
    }

    function fail(error) {
      if (!finish()) {
        return;
      }

      state.cancelObsPasswordPrompt?.(error);
      state.cancelObsInputPrompt?.(error);
      state.isListening = false;
      state.obsRequestId = null;
      if (state.obsSocket === socket) {
        state.obsSocket = null;
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      reject(error);
    }

    socket.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.op === 0) {
          const hello = message.d;
          const identify = {
            op: 1,
            d: {
              rpcVersion: hello.rpcVersion,
              eventSubscriptions: 65544,
            },
          };

          if (hello.authentication) {
            const password = await requestObsPassword();

            identify.d.authentication = await createObsAuthentication(
              password,
              hello.authentication.salt,
              hello.authentication.challenge,
            );
          }

          socket.send(JSON.stringify(identify));
          return;
        }

        if (message.op === 2) {
          identified = true;
          state.obsRequestId = `avatar-input-${Date.now()}`;
          socket.send(JSON.stringify({
            op: 6,
            d: {
              requestType: 'GetInputList',
              requestId: state.obsRequestId,
            },
          }));
          return;
        }

        if (message.op === 7 && message.d.requestId === state.obsRequestId) {
          if (!message.d.requestStatus?.result) {
            fail(new Error(message.d.requestStatus?.comment || 'O OBS não retornou a lista de fontes de áudio.'));
            return;
          }

          const inputs = message.d.responseData?.inputs || [];
          if (inputs.length === 0) {
            fail(new Error('O OBS não encontrou fontes para monitorar.'));
            return;
          }

          state.obsInputName = await requestObsInputName(inputs);

          if (finish()) {
            state.obsRequestId = null;
            state.isListening = true;
            setStatus('listening');
            setAvatar(state.silentSource, false);
            resolve(true);
          }
          return;
        }

        if (message.op === 5 && message.d.eventType === 'InputVolumeMeters') {
          const level = getObsInputLevel(message.d.eventData?.inputs);
          if (level === null || !state.isListening) {
            return;
          }

          const sensitivity = Number(sensitivitySlider.value);
          const threshold = 0.005 + ((100 - sensitivity) / 100) * 0.075;
          const detected = level > threshold;
          setStatus(detected ? 'active' : 'listening');
          setAvatar(detected ? state.activeSource : state.silentSource, detected);
        }
      } catch (error) {
        fail(error);
      }
    });

    socket.addEventListener('error', () => {
      fail(new Error('Não foi possível abrir ws://127.0.0.1:4455. Confira se o servidor WebSocket está ativo no OBS.'));
    });

    socket.addEventListener('close', () => {
      if (!settled) {
        fail(new Error(identified
          ? 'O OBS encerrou a conexão WebSocket.'
          : 'O OBS recusou a conexão. Verifique o servidor WebSocket e a senha.'));
      } else if (state.obsSocket === socket) {
        state.obsSocket = null;
        state.isListening = false;
        state.obsRequestId = null;
        if (document.body.classList.contains('obs-ui-hidden')) {
          toggleObsUi();
        }
        setStatus('error', 'Conexão com o OBS perdida.');
        setAvatar(state.silentSource, false);
        toggleMicrophoneButton.textContent = 'Conectar ao OBS';
      }
    });
  });
}

function stopAudioMonitoring() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }

  state.analyser = null;
  state.dataArray = null;
  if (state.obsSocket) {
    const socket = state.obsSocket;
    state.obsSocket = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }
  state.obsRequestId = null;
  state.isListening = false;

  setStatus('idle');
  setAvatar(state.silentSource, false);
}

function getAudioLevel() {
  if (!state.analyser || !state.dataArray) {
    return 0;
  }

  state.analyser.getByteTimeDomainData(state.dataArray);

  let sum = 0;
  const length = state.dataArray.length;

  for (let i = 0; i < length; i += 1) {
    const value = (state.dataArray[i] - 128) / 128;
    sum += value * value;
  }

  return Math.sqrt(sum / length);
}

function updateVoiceDetection() {
  if (!state.isListening) {
    return;
  }

  const volume = getAudioLevel();
  const sensitivity = Number(sensitivitySlider.value);

  const threshold = 0.08 + ((100 - sensitivity) / 100) * 0.42;
  const detected = volume > threshold;

  setStatus(detected ? 'active' : 'listening');
  setAvatar(detected ? state.activeSource : state.silentSource, detected);

  state.animationFrame = requestAnimationFrame(updateVoiceDetection);
}

async function startMicrophone() {
  if (obsMode) {
    setStatus('requesting');
    try {
      await connectToObs();
      return true;
    } catch (error) {
      console.error('Erro ao conectar ao WebSocket do OBS:', error);
      setStatus('error', getObsErrorMessage(error));
      return false;
    }
  }

  let stream;
  let audioContext;
  setStatus('requesting');

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error = new Error('getUserMedia não está disponível nesta página.');
      error.name = 'SecurityError';
      throw error;
    }

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;

    source.connect(analyser);

    state.stream = stream;
    state.audioContext = audioContext;
    state.analyser = analyser;
    state.dataArray = new Uint8Array(analyser.fftSize);
    state.isListening = true;

    setStatus('listening');
    setAvatar(state.silentSource, false);
    updateVoiceDetection();
    return true;
  } catch (error) {
    console.error('Erro ao acessar o microfone:', error);
    stream?.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext !== state.audioContext) {
      audioContext.close();
    }
    setStatus('error', getMicrophoneErrorMessage(error));
    return false;
  }
}

function applySelectedImage(event, type) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const fileUrl = URL.createObjectURL(file);

  if (type === 'silent') {
    state.silentSource = fileUrl;
    if (!state.isListening) {
      setAvatar(fileUrl, false);
    } else {
      setAvatar(state.activeSource, false);
    }
  }

  if (type === 'active') {
    state.activeSource = fileUrl;
    if (state.isListening) {
      setAvatar(fileUrl, true);
    }
  }
}

sensitivitySlider.addEventListener('input', () => {
  updateSensitivityLabel();
  if (state.isListening) {
    setStatus('listening');
    setAvatar(state.silentSource, false);
  }
});

toggleMicrophoneButton.addEventListener('click', async () => {
  if (state.isListening) {
    stopAudioMonitoring();
    toggleMicrophoneButton.textContent = obsMode ? 'Conectar ao OBS' : 'Ativar microfone';
    return;
  }

  toggleMicrophoneButton.disabled = true;
  toggleMicrophoneButton.textContent = obsMode ? 'Conectando ao OBS...' : 'Aguardando permissão...';
  const started = await startMicrophone();
  toggleMicrophoneButton.disabled = false;
  toggleMicrophoneButton.textContent = started
    ? (obsMode ? 'Desconectar do OBS' : 'Desativar microfone')
    : (obsMode ? 'Conectar ao OBS' : 'Ativar microfone');
  if (started && obsMode && !document.body.classList.contains('obs-ui-hidden')) {
    toggleObsUi();
  }
});

toggleObsUiButton.addEventListener('click', toggleObsUi);

document.addEventListener('keydown', (event) => {
  if (!obsMode || event.key.toLowerCase() !== 'h' || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
    return;
  }

  toggleObsUi();
});

stopMicrophoneButton.addEventListener('click', () => {
  stopAudioMonitoring();
  toggleMicrophoneButton.textContent = 'Ativar microfone';
});

silentInput.addEventListener('change', (event) => applySelectedImage(event, 'silent'));
activeInput.addEventListener('change', (event) => applySelectedImage(event, 'active'));

updateSensitivityLabel();
setStatus('idle');
setAvatar(defaultSilentImage, false);
if (obsMode) {
  toggleMicrophoneButton.textContent = 'Conectar ao OBS';
}
