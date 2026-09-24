const socket = io();
const $ = id => document.getElementById(id);
const lobby=$("lobby"), call=$("call"), localVideo=$("localVideo"), remoteVideo=$("remoteVideo");
let roomId, localStream, pc, initiator=false, timerStart, timerInterval;
let recorder, chunks=[], recording=false, screenStream;
let recordingAudioCtx, recordingCanvasStream, recordingAnimationFrame;

const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

function randomRoom(){ return crypto.randomUUID().replaceAll("-","").slice(0,12); }
function roomFromUrl(){ return new URLSearchParams(location.search).get("room"); }

$("create").onclick=()=>enter(randomRoom());
$("join").onclick=()=>{ const r=$("roomInput").value.trim(); if(r) enter(r); };
$("copy").onclick=async()=>{ await navigator.clipboard.writeText($("inviteLink").value); $("copy").textContent="Copied!"; setTimeout(()=>$("copy").textContent="Copy invite",1200); };

async function enter(id){
  roomId=id;
  try{
    localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
  }catch(e){ alert("Camera and microphone permission are required."); return; }
  localVideo.srcObject=localStream;
  lobby.hidden=true; call.hidden=false;
  history.replaceState(null,"",`?room=${encodeURIComponent(roomId)}`);
  $("inviteLink").value=location.href;
  socket.emit("join-room",roomId);
}

socket.on("joined-room", x=>{ initiator=x.initiator; $("status").textContent="Waiting for the other person…"; });
socket.on("room-full",()=>{ alert("This private room already has two people."); location.href="/"; });
socket.on("ready", async()=>{
  $("status").textContent="Connected";
  startTimer();
  await makePeer();
  if(initiator){
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal({type:"offer",sdp:offer});
  }
});
socket.on("signal", async data=>{
  if(!pc) await makePeer();
  if(data.type==="offer"){
    await pc.setRemoteDescription(data.sdp);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signal({type:"answer",sdp:answer});
  }else if(data.type==="answer"){
    await pc.setRemoteDescription(data.sdp);
  }else if(data.type==="candidate" && data.candidate){
    try{ await pc.addIceCandidate(data.candidate); }catch(e){ console.error(e); }
  }
});
socket.on("peer-left",()=>{ $("status").textContent="Other person left"; remoteVideo.srcObject=null; if(pc){pc.close();pc=null;} });
socket.on("recording-state", active=>showRecording(active));

async function makePeer(){
  if(pc) return;
  pc=new RTCPeerConnection({iceServers});
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>remoteVideo.srcObject=e.streams[0];
  pc.onicecandidate=e=>{ if(e.candidate) signal({type:"candidate",candidate:e.candidate}); };
}
function signal(data){ socket.emit("signal",{roomId,data}); }

$("mute").onclick=()=>{
  const t=localStream.getAudioTracks()[0]; t.enabled=!t.enabled;
  $("mute").textContent=t.enabled?"🎤 Mute":"🔇 Unmute";
};
$("camera").onclick=()=>{
  const t=localStream.getVideoTracks()[0]; t.enabled=!t.enabled;
  $("camera").textContent=t.enabled?"📹 Camera off":"📷 Camera on";
};
$("share").onclick=async()=>{
  if(screenStream){ stopShare(); return; }
  try{
    screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});
    const screenTrack=screenStream.getVideoTracks()[0];
    const sender=pc?.getSenders().find(s=>s.track?.kind==="video");
    if(sender) await sender.replaceTrack(screenTrack);
    localVideo.srcObject=screenStream;
    $("share").textContent="🖥 Stop sharing";
    screenTrack.onended=stopShare;
  }catch(e){}
};
async function stopShare(){
  if(!screenStream)return;
  screenStream.getTracks().forEach(t=>t.stop());
  screenStream=null;
  const cam=localStream.getVideoTracks()[0];
  const sender=pc?.getSenders().find(s=>s.track?.kind==="video");
  if(sender) await sender.replaceTrack(cam);
  localVideo.srcObject=localStream;
  $("share").textContent="🖥 Share screen";
}

$("record").onclick=()=> recording ? stopRecording() : startRecording();

function drawVideoCover(ctx, video, x, y, width, height){
  if(!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  const scale=Math.max(width/video.videoWidth, height/video.videoHeight);
  const sw=width/scale, sh=height/scale;
  const sx=(video.videoWidth-sw)/2, sy=(video.videoHeight-sh)/2;
  ctx.drawImage(video,sx,sy,sw,sh,x,y,width,height);
}

function startRecording(){
  const remoteStream=remoteVideo.srcObject;
  if(!remoteStream){
    alert("Wait for the other person to connect before recording.");
    return;
  }

  // Mix both participants' audio into one track.
  recordingAudioCtx=new AudioContext();
  const dest=recordingAudioCtx.createMediaStreamDestination();
  [localStream, remoteStream].filter(Boolean).forEach(s=>{
    if(s.getAudioTracks().length){
      const src=recordingAudioCtx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
      src.connect(dest);
    }
  });
  if(recordingAudioCtx.state==="suspended") recordingAudioCtx.resume();

  // Compose both live video elements into one 16:9 canvas.
  const canvas=document.createElement("canvas");
  canvas.width=1280;
  canvas.height=720;
  const ctx=canvas.getContext("2d");

  const renderFrame=()=>{
    ctx.fillStyle="#000";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // Remote participant on the left; local participant on the right.
    drawVideoCover(ctx,remoteVideo,0,0,640,720);
    drawVideoCover(ctx,localVideo,640,0,640,720);

    // Thin divider makes the two-person layout obvious in the saved recording.
    ctx.fillStyle="rgba(255,255,255,.35)";
    ctx.fillRect(638,0,4,720);
    recordingAnimationFrame=requestAnimationFrame(renderFrame);
  };
  renderFrame();

  recordingCanvasStream=canvas.captureStream(30);
  const canvasVideoTrack=recordingCanvasStream.getVideoTracks()[0];
  const mixed=new MediaStream([
    canvasVideoTrack,
    ...dest.stream.getAudioTracks()
  ]);

  const type=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";
  recorder=new MediaRecorder(mixed,{mimeType:type});
  chunks=[];
  recorder.ondataavailable=e=>{ if(e.data.size) chunks.push(e.data); };
  recorder.onstop=()=>{
    if(recordingAnimationFrame) cancelAnimationFrame(recordingAnimationFrame);
    recordingAnimationFrame=null;
    recordingCanvasStream?.getTracks().forEach(t=>t.stop());
    recordingCanvasStream=null;
    recordingAudioCtx?.close();
    recordingAudioCtx=null;

    const blob=new Blob(chunks,{type:"video/webm"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`private-call-${new Date().toISOString().replaceAll(":","-")}.webm`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  recorder.start(1000);
  recording=true;
  showRecording(true);
  socket.emit("recording-state",{roomId,active:true});
  $("record").textContent="⏹ Stop recording";
}
function stopRecording(){
  if(recorder?.state!=="inactive") recorder.stop();
  recording=false;
  showRecording(false);
  socket.emit("recording-state",{roomId,active:false});
  $("record").textContent="⏺ Record";
}
function showRecording(active){ $("recordBanner").hidden=!active; }

function startTimer(){
  if(timerInterval)return;
  timerStart=Date.now();
  timerInterval=setInterval(()=>{
    const s=Math.floor((Date.now()-timerStart)/1000);
    $("timer").textContent=`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  },1000);
}
$("leave").onclick=()=>{ if(recording)stopRecording(); localStream?.getTracks().forEach(t=>t.stop()); location.href="/"; };

const initial=roomFromUrl(); if(initial) enter(initial);
