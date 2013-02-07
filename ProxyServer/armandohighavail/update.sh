cp staticserver2.js staticserver.js
kill -SIGUSR2 $(cat server.pid)

