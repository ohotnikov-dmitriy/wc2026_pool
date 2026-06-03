/* Bracket editor — center-converging "tree" canvas faithful to the original.
 * Public API unchanged: BracketEditor(root,{readOnly,onChange}) -> {setPicks,getPicks,complete,setReadOnly}
 * picks shape: { groups:{A:[t1..t4]}, thirdsQ:[gLetters], thirds:{slotId:team}, winners:{matchId:team} }
 */
function BracketEditor(root, opts) {
  opts = opts || {};
  var readOnly = !!opts.readOnly;
  var onChange = opts.onChange || function(){};
  var picks = norm(WC.emptyPicks());

  function norm(p){ p=p||{}; p.groups=p.groups||{}; p.thirdsQ=p.thirdsQ||[]; p.thirds=p.thirds||{}; p.winners=p.winners||{}; return p; }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function flag(t){ var c=WC.iso[t]; return c?('<img class="cflag" loading="lazy" alt="" src="https://flagcdn.com/w40/'+c+'.png">'):''; }

  // ---- Layout geometry (canvas units) ----
  var MW=190, MH=88, UNIT=104, TOP=40, GW=196, GH=170, GGAP=26;
  var X={ gL:0, r32L:250, r16L:475, qfL:700, sfL:915, fin:1130, sfR:1345, qfR:1560, r16R:1785, r32R:2010, gR:2260 };
  var leftR32=[74,77,73,75,83,84,81,82], rightR32=[76,78,79,80,86,88,85,87];
  var leftGroups=['A','C','E','G','I','K'], rightGroups=['B','D','F','H','J','L'];
  var TOTAL_H = 8*UNIT;                       // knockout half height
  var GROUPS_H = 6*GH + 5*GGAP;               // 6 group cards stacked
  var CONTENT_H = Math.max(TOTAL_H, GROUPS_H);
  var KNOCK_OFF = (CONTENT_H - TOTAL_H)/2;     // center the knockout tree vertically
  var GROUP_OFF = (CONTENT_H - GROUPS_H)/2;
  var CW = X.gR+GW+40, CH = TOP+CONTENT_H+40;

  function rowCenter(id){
    var i=leftR32.indexOf(id); if(i<0) i=rightR32.indexOf(id);
    return TOP + i*UNIT + MH/2;
  }
  var _c={};
  function centerOf(id){
    if(_c[id]!=null) return _c[id];
    var v;
    if(leftR32.indexOf(id)>=0||rightR32.indexOf(id)>=0) v=rowCenter(id);
    else {
      var from = (WC.R16[id]&&WC.R16[id].from) || (WC.QF[id]&&WC.QF[id].from) ||
                 (id===101?[97,98]:id===102?[99,100]:id===103?[101,102]:id===104?[101,102]:null);
      v = (centerOf(from[0])+centerOf(from[1]))/2;
    }
    return _c[id]=v;
  }
  function xOf(id){
    if(leftR32.indexOf(id)>=0) return X.r32L; if(rightR32.indexOf(id)>=0) return X.r32R;
    if([89,90,93,94].indexOf(id)>=0) return X.r16L; if([91,92,95,96].indexOf(id)>=0) return X.r16R;
    if(id===97||id===98) return X.qfL; if(id===99||id===100) return X.qfR;
    if(id===101) return X.sfL; if(id===102) return X.sfR;
    return X.fin; // 103,104
  }
  function isLeft(id){ return xOf(id) < X.fin; }
  function box(id){
    var x=xOf(id), y;
    if(id===104) y = centerOf(103)-MH/2 + MH + 70;
    else y = centerOf(id)-MH/2;
    return { x:x, y:y+KNOCK_OFF, w:MW, h:MH };
  }
  var POS={}; [].concat(leftR32,rightR32,[89,90,93,96,91,92,94,95,97,98,99,100,101,102,103,104]).forEach(function(id){ POS[id]=box(id); });
  var GPOS={};
  function placeGroups(arr,gx){ arr.forEach(function(g,i){ GPOS[g]={x:gx,y:TOP+GROUP_OFF+i*(GH+GGAP),w:GW}; }); }
  placeGroups(leftGroups,X.gL); placeGroups(rightGroups,X.gR);

  // ---- picks helpers ----
  function order(g){ return picks.groups[g]||[]; }
  function rankTeam(g,r){ var o=order(g); return o[r-1]||null; }

  // thirds: official FIFA Annex C allocation (thirds-table.js). Returns {matchId: groupLetter}.
  function thirdGroups(){ // {matchId: groupLetter} or {}
    var a = (typeof WC_THIRD_ASSIGN==='function') ? WC_THIRD_ASSIGN(picks.thirdsQ||[]) : null;
    return a || {};
  }
  function recomputeThirds(){
    picks.thirds={};
    var ag=thirdGroups();
    Object.keys(ag).forEach(function(mid){ var t=rankTeam(ag[mid],3); if(t) picks.thirds[mid]=t; });
  }

  var KO_ORDER=[].concat(WC.r32.map(function(m){return m.id;}),WC.r16.map(function(m){return m.id;}),WC.qf.map(function(m){return m.id;}),[101,102,103,104]);
  function reconcile(){
    recomputeThirds();
    KO_ORDER.forEach(function(id){ var w=picks.winners[id]; if(!w) return; var t=WC.teamsOf(picks,id);
      if(!t[0]||!t[1]||(w!==t[0]&&w!==t[1])) delete picks.winners[id]; });
  }
  function changed(){ reconcile(); render(); onChange(picks); }

  // ---- interactions ----
  function clickTeam(g,team){ if(readOnly) return; var o=order(g).slice(); var i=o.indexOf(team);
    if(i<0){ if(o.length<4) o.push(team); } else o=o.slice(0,i);
    if(o.length===3){ var rem=WC.groups[g].filter(function(t){return o.indexOf(t)<0;})[0]; if(rem) o.push(rem); } // auto 4th
    picks.groups[g]=o;
    changed(); }
  function toggleThird(g){ if(readOnly) return; var q=picks.thirdsQ.slice(); var i=q.indexOf(g);
    if(i>=0) q.splice(i,1); else { if(q.length>=8) return; q.push(g); }
    picks.thirdsQ=q; changed(); }
  function pickWinner(id,team){ if(readOnly||!team) return; picks.winners[id]=team; changed(); }

  // ---- rendering ----
  function teamRow(g,team){
    var o=order(g), pos=o.indexOf(team)+1, q=picks.thirdsQ.indexOf(g)>=0;
    var cls='team-row'+(pos?' rank-'+pos:'')+(pos===4?' out':'');
    var dot = pos===1||pos===2 ? '<span class="status-dot adv"></span>' :
              (pos===3 && q ? '<span class="status-dot third"></span>' :
              (pos===3 ? '<span class="status-dot pending"></span>' : '<span></span>'));
    return '<div class="'+cls+'" data-g="'+g+'" data-team="'+esc(team)+'">'+
      '<span class="rank">'+(pos||'·')+'</span>'+flag(team)+
      '<span class="team-name">'+esc(team)+'</span>'+dot+'</div>';
  }
  function groupCard(g){
    var p=GPOS[g], o=order(g), thirdTeam=rankTeam(g,3), on=picks.thirdsQ.indexOf(g)>=0;
    var qFull = picks.thirdsQ.length>=8 && !on;
    var canThird = !!thirdTeam && !readOnly && !qFull;
    var toggle = readOnly ? '' :
      '<button class="third-toggle'+(on?' on':'')+'" data-third-toggle="'+g+'"'+(canThird||on?'':' disabled')+'>'+
      (on?'3rd ✓':'3rd')+'</button>';
    var rows=WC.groups[g].map(function(t){ return teamRow(g,t); }).join('');
    return '<div class="group-card" style="left:'+p.x+'px;top:'+p.y+'px;width:'+p.w+'px">'+
      '<div class="group-header"><span class="group-letter">GROUP '+g+'</span>'+toggle+'</div>'+rows+'</div>';
  }
  function slotHTML(id,side){
    var t=WC.teamsOf(picks,id)[side], w=picks.winners[id];
    if(!t){ return '<div class="slot empty"><span class="placeholder">— TBD —</span></div>'; }
    var won=w===t;
    return '<div class="slot'+(won?' won':'')+(readOnly?' ro':'')+'" data-win="'+id+'" data-team="'+esc(t)+'">'+
      flag(t)+'<span class="team-name">'+esc(t)+'</span></div>';
  }
  function matchCard(id,label){
    var p=POS[id], fin=id===103;
    return '<div class="match-card'+(fin?' round-FINAL':'')+'" style="left:'+p.x+'px;top:'+p.y+'px;width:'+p.w+'px">'+
      '<div class="match-id">'+(label||('#'+id))+'</div>'+slotHTML(id,0)+slotHTML(id,1)+'</div>';
  }

  function path(x1,y1,x2,y2){ var dx=(x2-x1)*0.45; return 'M'+x1+' '+y1+' C'+(x1+dx)+' '+y1+','+(x2-dx)+' '+y2+','+x2+' '+y2; }
  function seg(x1,y1,x2,y2,col,w,dash){ return '<path d="'+path(x1,y1,x2,y2)+'" stroke="'+col+'" stroke-width="'+w+'" fill="none"'+(dash?' stroke-dasharray="6 5"':'')+'/>'; }
  function connectors(){
    var segs=[];
    function ko(parent, childId){
      var pc=POS[parent], cc=POS[childId];
      var live = !!picks.winners[childId];
      var col = live ? 'rgba(245,176,65,.6)' : 'rgba(255,255,255,.12)';
      var x1,y1,x2,y2;
      if(isLeft(childId)){ x1=cc.x+cc.w; y1=cc.y+MH/2; x2=pc.x; y2=pc.y+MH/2; }
      else { x1=cc.x; y1=cc.y+MH/2; x2=pc.x+pc.w; y2=pc.y+MH/2; }
      segs.push(seg(x1,y1,x2,y2,col,live?2.2:1.2,false));
    }
    [].concat(WC.r16,WC.qf).forEach(function(m){ m.from.forEach(function(c){ ko(m.id,c); }); });
    [{id:101,from:[97,98]},{id:102,from:[99,100]}].forEach(function(m){ m.from.forEach(function(c){ ko(m.id,c); }); });
    [101,102].forEach(function(s){ ko(103,s); });
    // bronze (losers) faint
    [101,102].forEach(function(s){ var pc=POS[104],cc=POS[s];
      var x1,y1,x2,y2; if(isLeft(s)){x1=cc.x+cc.w;y1=cc.y+MH-10;x2=pc.x;y2=pc.y+MH/2;} else {x1=cc.x;y1=cc.y+MH-10;x2=pc.x+pc.w;y2=pc.y+MH/2;}
      segs.push(seg(x1,y1,x2,y2,'rgba(255,255,255,.07)',1,false)); });
    // group -> R32 rank slots, faint
    WC.r32.forEach(function(m){ ['a','b'].forEach(function(side){ var sl=m[side]; if(sl.kind!=='rank') return;
      var gp=GPOS[sl.g], rc=POS[m.id]; if(!gp) return;
      var x1=(gp.x<X.fin)?gp.x+gp.w:gp.x, y1=gp.y+GH/2;
      var x2=isLeft(m.id)?rc.x:rc.x+rc.w, y2=rc.y+MH/2;
      segs.push(seg(x1,y1,x2,y2,'rgba(255,255,255,.05)',1,false));
    }); });
    // assigned thirds -> their R32 slot, GOLD DASHED (the original's highlighted route)
    var ag=thirdGroups();
    Object.keys(ag).forEach(function(mid){ mid=+mid; var g=ag[mid], gp=GPOS[g], rc=POS[mid]; if(!gp||!picks.thirds[mid]) return;
      var x1=(gp.x<X.fin)?gp.x+gp.w:gp.x, y1=gp.y+GH/2;
      var x2=isLeft(mid)?rc.x:rc.x+rc.w, y2=rc.y+MH/2;
      segs.push(seg(x1,y1,x2,y2,'rgba(245,176,65,.55)',1.6,true));
    });
    return '<svg class="lines" width="'+CW+'" height="'+CH+'" viewBox="0 0 '+CW+' '+CH+'">'+segs.join('')+'</svg>';
  }

  function labelsHTML(){
    var f=POS[103], b=POS[104], champ=picks.winners[103];
    var html='';
    if(champ){ html+='<div class="champion" style="left:'+(f.x-22)+'px;top:'+(f.y-118)+'px;width:'+(MW+44)+'px">'+
      '<div class="champion-label">CHAMPION</div><div class="champion-team">'+flag(champ)+'<span>'+esc(champ)+'</span></div></div>'; }
    html+='<div class="trophy-label" style="left:'+(f.x-5)+'px;top:'+(f.y-44)+'px;width:'+(MW+10)+'px">'+
      '<div class="trophy-title">FINAL</div><div class="trophy-sub">JULY 19, 2026</div></div>'+
      '<div class="trophy-label" style="left:'+(b.x-5)+'px;top:'+(b.y-28)+'px;width:'+(MW+10)+'px">'+
      '<div class="trophy-sub">3RD PLACE</div></div>';
    return html;
  }

  var view={tx:0,ty:0,scale:1};
  function canvasEl(){ return root.querySelector('.canvas'); }
  function applyView(){ var c=canvasEl(); if(c) c.style.transform='translate('+view.tx+'px,'+view.ty+'px) scale('+view.scale+')'; }

  function render(){
    _c={}; // reset center memo (positions static but cheap)
    var groups=leftGroups.concat(rightGroups).map(groupCard).join('');
    var matches=[].concat(leftR32,rightR32,[89,90,93,94,91,92,95,96,97,98,99,100,101,102,104]).map(function(id){ return matchCard(id); }).join('');
    matches += matchCard(103,'FINAL');
    root.querySelector('.canvas').innerHTML = connectors()+groups+matches+labelsHTML();
    updateThirdStatus(); applyView();
  }
  function updateThirdStatus(){
    var el=root.querySelector('.third-status'); if(!el) return;
    var n=Math.min((picks.thirdsQ||[]).length,8);
    el.innerHTML='Best thirds: <strong>'+n+' / 8</strong> selected';
  }

  // ---- build shell (toolbar + stage) once ----
  root.innerHTML =
    '<div class="ed-toolbar">'+
      '<div class="zoom-controls"><button data-zoom="out">−</button><button class="fit" data-zoom="fit">FIT</button><button data-zoom="in">+</button></div>'+
      '<div class="third-status">Best thirds: <strong>0 / 8</strong> selected</div>'+
      '<span class="muted" style="font-size:12px">Drag to pan · scroll to zoom · tap teams to rank groups · toggle “3rd” on the 8 wildcard groups · tap a team in a match to advance it</span>'+
    '</div>'+
    '<div class="stage"><div class="canvas" style="width:'+CW+'px;height:'+CH+'px"></div></div>';

  var stage=root.querySelector('.stage');

  // pan/zoom
  var dragging=false, moved=false, sx=0, sy=0, ox=0, oy=0;
  stage.addEventListener('pointerdown', function(e){
    if(e.target.closest('.team-row,.slot,.third-toggle,.zoom-controls')) return; // let those click
    dragging=true; moved=false; sx=e.clientX; sy=e.clientY; ox=view.tx; oy=view.ty;
    stage.classList.add('grabbing'); stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', function(e){
    if(!dragging) return; var dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)+Math.abs(dy)>3) moved=true;
    view.tx=ox+dx; view.ty=oy+dy; applyView();
  });
function endDrag(e){
    dragging = false;
    stage.classList.remove('grabbing');

    setTimeout(function(){
        moved = false;
    }, 0);
}
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('wheel', function(e){ e.preventDefault();
    var rect=stage.getBoundingClientRect(), mx=e.clientX-rect.left, my=e.clientY-rect.top;
    var factor=e.deltaY<0?1.1:0.9, ns=Math.min(2.2,Math.max(0.25,view.scale*factor));
    var k=ns/view.scale; view.tx=mx-(mx-view.tx)*k; view.ty=my-(my-view.ty)*k; view.scale=ns; applyView();
  }, {passive:false});

  function fit(){
    var rect=stage.getBoundingClientRect();
    var s=Math.min(rect.width/CW, rect.height/CH)*0.96; if(!isFinite(s)||s<=0) s=0.5;
    view.scale=s; view.tx=(rect.width-CW*s)/2; view.ty=(rect.height-CH*s)/2; applyView();
  }

  root.addEventListener('click', function(e){
    var z=e.target.closest('[data-zoom]');
    if(z){ var k=z.getAttribute('data-zoom'); if(k==='fit') fit();
      else { var rect=stage.getBoundingClientRect(), mx=rect.width/2,my=rect.height/2;
        var ns=Math.min(2.2,Math.max(0.25,view.scale*(k==='in'?1.18:0.85))), kk=ns/view.scale;
        view.tx=mx-(mx-view.tx)*kk; view.ty=my-(my-view.ty)*kk; view.scale=ns; applyView(); } return; }
    if(moved) return; // was a pan
    var tt=e.target.closest('[data-third-toggle]'); if(tt){ toggleThird(tt.getAttribute('data-third-toggle')); return; }
    var tr=e.target.closest('.team-row[data-g]'); if(tr){ clickTeam(tr.getAttribute('data-g'), tr.getAttribute('data-team')); return; }
    var sl=e.target.closest('.slot[data-win]'); if(sl){ var t=sl.getAttribute('data-team'); if(t) pickWinner(+sl.getAttribute('data-win'),t); return; }
  });

  reconcile(); render();
  setTimeout(fit, 30); // fit after layout

  return {
    setPicks:function(p){ picks=norm(p&&typeof p==='object'?p:WC.emptyPicks()); reconcile(); render(); setTimeout(fit,20); },
    getPicks:function(){ return JSON.parse(JSON.stringify(picks)); },
    complete:function(){ return WC.isComplete(picks); },
    setReadOnly:function(v){ readOnly=!!v; render(); }
  };
}
