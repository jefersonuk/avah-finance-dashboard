"""Baixa os pesos do Whisper e do LLM pelo Docker Hub.

Para redes onde ollama.com, huggingface.co e openaipublic.azureedge.net são
bloqueados mas o Docker Hub não. Baixa só as camadas necessárias (não a imagem
inteira) e confere o digest de cada uma.

  python3 -I fetch-models.py <diretório-de-destino> [whisper] [llm]

Sem a lista, baixa os dois.

Resultado:
  <dest>/ollama/qwen3-4b-instruct-2507-q4_K_M.gguf  (ai/qwen3, Docker Model Runner)
  <dest>/whisper/{base,small}.pt                    (pesos oficiais da OpenAI;
                                                     o openai-whisper confere o SHA-256 ao carregar)
"""
import hashlib
import json
import os
import sys
import tarfile
import urllib.request

REGISTRY = "https://registry-1.docker.io/v2"
ACCEPT = ",".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
])

LLM = ("ai/qwen3", "4b-instruct-2507-q4_K_M",
       "sha256:3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
       "qwen3-4b-instruct-2507-q4_K_M.gguf")
# Camadas "whisper --model <x>" da imagem hisano/whisper:latest.
WHISPER = {
    "base": "sha256:c6f58ffc9bcab264dcade9d4a9399bc792a8461d3ff446550b76707f1310720f",
    "small": "sha256:94fc514525ec9b8cb5029c02a2e450b42a56466d8d6ffa1a3dfde94699a2b834",
}
WHISPER_SHA256 = {
    "base": "ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e",
    "small": "9ecf779972d90ba49c06d968637d720dd632c55bbf19d441fb42bf17a411e794",
}


def token(repo):
    url = f"https://auth.docker.io/token?service=registry.docker.io&scope=repository:{repo}:pull"
    return json.load(urllib.request.urlopen(url))["token"]


def fetch_blob(repo, digest, out):
    if os.path.exists(out) and sha256(out) == digest.split(":", 1)[1]:
        print("já existe", out)
        return
    req = urllib.request.Request(f"{REGISTRY}/{repo}/blobs/{digest}",
                                 headers={"Authorization": f"Bearer {token(repo)}"})
    h = hashlib.sha256()
    with urllib.request.urlopen(req) as r, open(out + ".part", "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
            h.update(chunk)
    if "sha256:" + h.hexdigest() != digest:
        raise SystemExit(f"digest inválido para {out}")
    os.replace(out + ".part", out)
    print("ok", out, os.path.getsize(out))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def fetch_llm(dest):
    os.makedirs(f"{dest}/ollama", exist_ok=True)
    repo, _tag, digest, name = LLM
    fetch_blob(repo, digest, f"{dest}/ollama/{name}")


def fetch_whisper(dest):
    os.makedirs(f"{dest}/whisper", exist_ok=True)
    for size, digest in WHISPER.items():
        target = f"{dest}/whisper/{size}.pt"
        if os.path.exists(target) and sha256(target) == WHISPER_SHA256[size]:
            print("já existe", target)
            continue
        layer = f"{dest}/whisper/{size}.layer.tar.gz"
        fetch_blob("hisano/whisper", digest, layer)
        member = f"root/.cache/whisper/{size}.pt"
        with tarfile.open(layer) as tar, open(target, "wb") as out:
            src = tar.extractfile(tar.getmember(member))
            while chunk := src.read(1 << 20):
                out.write(chunk)
        os.remove(layer)
        if sha256(target) != WHISPER_SHA256[size]:
            raise SystemExit(f"SHA-256 inesperado em {target}")
        print("ok", target)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    dest, what = sys.argv[1], sys.argv[2:] or ["whisper", "llm"]
    if "whisper" in what:
        fetch_whisper(dest)
    if "llm" in what:
        fetch_llm(dest)
