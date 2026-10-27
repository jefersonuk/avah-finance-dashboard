# Ollama só com o runtime de CPU (~0,2 GB em vez de ~8,4 GB da imagem oficial,
# que traz CUDA 12/13 e Vulkan). Mesmo binário e mesmas bibliotecas ggml/llama.
FROM ollama/ollama:0.40.11 AS src
RUN rm -rf /usr/lib/ollama/cuda_v12 /usr/lib/ollama/cuda_v13 \
    /usr/lib/ollama/mlx_cuda_v13 /usr/lib/ollama/vulkan /usr/lib/ollama/include

FROM ubuntu:24.04
COPY --from=src /usr/lib/ollama /usr/lib/ollama
COPY --from=src /usr/bin/ollama /usr/bin/ollama
ENV OLLAMA_HOST=0.0.0.0:11434
EXPOSE 11434
ENTRYPOINT ["/usr/bin/ollama"]
CMD ["serve"]
