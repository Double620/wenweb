let detector;
self.onmessage=async ({data})=>{
  try{
    if(data.type==='load'){
      const {createTracker}=await import('./hands.js');
      detector=await createTracker(progress=>self.postMessage({type:'progress',progress}));
      self.postMessage({type:'ready'});
    }else if(data.type==='resume'){
      self.postMessage({type:'ready'});
    }else if(data.frame){
      try {
        const result=detector.detectForVideo(data.frame,data.time);
        self.postMessage({type:'hands',landmarks:result.landmarks});
      }finally{data.frame.close();}
    }
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
