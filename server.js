const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", socket => {
  socket.on("join-room", roomId => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const size = room ? room.size : 0;
    if (size >= 2) return socket.emit("room-full");

    socket.join(roomId);
    socket.data.roomId = roomId;
    const newSize = size + 1;
    socket.emit("joined-room", { initiator: newSize === 1 });
    if (newSize === 2) io.to(roomId).emit("ready");
  });

  socket.on("signal", ({ roomId, data }) => {
    socket.to(roomId).emit("signal", data);
  });

  socket.on("recording-state", ({ roomId, active }) => {
    socket.to(roomId).emit("recording-state", active);
  });

  socket.on("disconnect", () => {
    if (socket.data.roomId) socket.to(socket.data.roomId).emit("peer-left");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Video app running on http://localhost:${PORT}`));
