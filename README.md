# Avatar de áudio

Uma página estática que alterna entre dois avatares conforme o volume captado pelo microfone. O processamento acontece no navegador; o áudio não é gravado nem enviado.

## Usar

Abra `index.html` em um servidor local ou acesse a versão publicada por HTTPS. Clique em **Ativar microfone** e permita o acesso quando o navegador pedir. Ajuste a sensibilidade e, se quiser, escolha imagens PNG ou SVG para os estados sem som e com som.

O acesso ao microfone requer uma origem segura, como HTTPS ou `localhost`. Para usar no OBS, adicione uma fonte **Navegador** apontando para a página com `?obs=1` no final do endereço. A conexão continua sendo feita pelo WebSocket local do OBS (porta `4455`); conecte e selecione a fonte de áudio como antes. Depois de conectar, os controles somem e fica somente o avatar. Pressione **H** (ou use **Mostrar controles** antes de conectar) para revelar os controles novamente. Ative o servidor WebSocket nas configurações do OBS.

## Publicar no GitHub Pages

O workflow em `.github/workflows/pages.yml` publica automaticamente os arquivos necessários quando há um push para `main`. No repositório, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. Também é possível iniciar a publicação manualmente pela aba **Actions**.

O artefato publicado contém apenas a página, o JavaScript, o CSS e as imagens do avatar; não inclui o iniciador do OBS nem as configurações do editor.

## Privacidade e discrição

Não há conta, serviço de áudio, analytics ou envio de gravações. A página só pede permissão para o microfone após a ação da pessoa e mede o nível de áudio localmente.

GitHub Pages hospeda conteúdo público e o JavaScript precisa ser baixado pelo navegador para funcionar. Portanto, a página pode ter aparência discreta e o artefato pode excluir arquivos auxiliares, mas isso **não torna o código-fonte secreto**. Em um repositório público, os arquivos do repositório também ficam visíveis. Para não expor o restante do projeto, publique a partir de um repositório separado contendo somente os arquivos do site.
