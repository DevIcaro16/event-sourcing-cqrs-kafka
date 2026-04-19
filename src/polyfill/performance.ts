// kafkajs mixes performance.now() (ms since process start in Bun) with Date.now()
// (Unix epoch ms) in request deadline calculations, producing large negative delays
// that collapse to 1ms timeouts. Aligning performance.now() to epoch fixes this.
performance.now = () => Date.now()
