import { Button, Input, Modal, Popover, Select } from 'antd';
import useRTCListeners from '../../hooks/useRTCListeners';
import { baseDownload } from '../../utils/download';
import React, { useEffect, useRef, useState } from 'react';
import useFaceActionLiveDetector from '../../hooks/useFaceActionLiveDetector';
import useRTCJoinRoom from '../../hooks/useRTCJoinRoom';
import useRTCWakeDevice from '../../hooks/useRTCWakeDevice';
import { generateAiToken, generateSignToken } from '../../utils/token';
import * as eruda from 'eruda';
import css from './index.module.scss';

/**
 * 光线检测状态值
 */
enum FaceFlashLiveStatus {
  Pending, // 预备
  InProgress, // 进行中
  Closed, // 已结束
}

const Room = () => {
  const roomToken = new URLSearchParams(location.search).get('roomToken') || '';
  const { RTCClient, isRTCRoomJoined } = useRTCJoinRoom(roomToken);
  const { localTracks, facingMode, setFacingMode } = useRTCWakeDevice(RTCClient);
  const cameraTrackElement = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [saying, setSaying] = useState(false);
  const audioAnalyzer = useRef<any>(null);
  const [captionText, setCaptionText] = useState<string>(); // 语音转文字字幕
  const targetFileInput = useRef<HTMLInputElement>(null);
  const {
    countdown,
    faceActionLiveDetectorText,
    faceActionLiveDetectorType,
    setFaceActionLiveDetectorType
  } = useFaceActionLiveDetector();
  const [faceActionLiveDetector, setFaceActionLiveDetector] = useState<any>();
  const [faceFlashLiveStatus, setFaceFlashLiveStatus] = useState<FaceFlashLiveStatus>(FaceFlashLiveStatus.Closed);
  const [isRecord, setIsRecord] = useState(false);
  const recorder = useRef(null);
  const [recordMimeTypes] = useState([
    'video/webm',
    'audio/webm',
    'video/webm\;codecs=vp8',
    'video/webm\;codecs=daala',
    'video/webm\;codecs=h264',
    'audio/webm\;codecs=opus',
    'video/mpeg'
  ]);
  const [recordMimeType, setRecordMimeType] = useState('video/webm');
  const remoteTrackElement = useRef(null);
  const { remoteTracks } = useRTCListeners(RTCClient);

  /**
   * 初始化
   */
  useEffect(() => {
    const isDebug = JSON.parse(new URLSearchParams(location.search).get('isDebug'));
    if (isDebug) eruda.init();
    // 初始化 aiToken
    QNRTCAI.init(generateAiToken(), generateSignToken);
  }, []);

  /**
   * 本地 Track 发生变化
   */
  useEffect(() => {
    if (isRTCRoomJoined) {
      localTracks.forEach(track => {
        if (track.tag === 'camera' && cameraTrackElement.current) track.play(cameraTrackElement.current);
      });
      RTCClient.publish(localTracks);
    }
  }, [localTracks, isRTCRoomJoined, RTCClient]);

  /**
   * 远端 Track 发生变化
   */
  useEffect(() => {
    if (isRTCRoomJoined) {
      console.log('remoteTracks', remoteTracks)
      remoteTracks.forEach(track => {
        if (remoteTrackElement.current) track.play(remoteTrackElement.current);
      });
    }
  }, [remoteTracks, isRTCRoomJoined, RTCClient]);

  /**
   * 离开房间
   */
  useEffect(() => {
    return () => {
      if (isRTCRoomJoined) {
        RTCClient.leave();
        // localTracks.forEach(track => track.release());
      }
    };
  }, [RTCClient, isRTCRoomJoined]);

  /**
   * 结束动作活体检测、开始响应识别结果
   */
  useEffect(() => {
    if (
      countdown <= 0 &&
      localTracks.length &&
      faceActionLiveDetectorType &&
      faceActionLiveDetector
    ) {
      faceActionLiveDetector.commit().then(response => {
        Modal.info({
          title: '动作活体检测信息',
          content: JSON.stringify(response, null, 2)
        });
      }).catch(error => {
        Modal.error({
          title: '动作活体检测报错',
          content: `请求失败，http status: ${error.status}`
        });
      }).finally(() => setFaceActionLiveDetector(undefined));
    }
  }, [countdown, faceActionLiveDetectorType, localTracks, faceActionLiveDetector]);

  /**
   * 身份证识别
   */
  const IDCard = () => {
    console.log('身份证识别');
    const cameraTrack = localTracks.find(t => t.tag === 'camera');
    QNRTCAI.IDCardDetector.run(cameraTrack).then((res: any) => {
      Modal.info({
        title: '身份证识别信息',
        content: JSON.stringify(res)
      });
    });
  };

  /**
   * 文字转语音
   */
  const textToSpeak = () => {
    QNRTCAI.textToSpeak({ text }).then(response => {
      const base64String = response.response.audio;
      const snd = new Audio('data:audio/wav;base64,' + base64String);
      snd.play().catch(error => {
        Modal.error({
          title: 'textToSpeak error',
          content: JSON.stringify(error)
        });
      });
    });
  };

  /**
   * 语音转文字
   */
  const speakToText = () => {
    const audioTrack = localTracks.find(t => t.tag === 'microphone');
    console.log('audioTrack', audioTrack);
    if (saying) { // 关闭
      audioAnalyzer.current.stopAudioToText();
    } else { // 开启
      audioAnalyzer.current = QNRTCAI.AudioToTextAnalyzer.startAudioToText(audioTrack, {
        hot_words: '清楚,10;清晰,1'
      }, {
        onAudioToText: (message: any) => {
          console.log('message', message);
          const captionText = message.transcript;
          if (captionText) {
            setCaptionText(captionText);
          }
        }
      });
    }
    setSaying(!saying);
  };

  /**
   * 人脸检测
   */
  const faceDetector = () => {
    const cameraTrack = localTracks.find(t => t.tag === 'camera');
    QNRTCAI.faceDetector(cameraTrack).then(response => {
      Modal.info({
        title: '人脸检测信息',
        content: JSON.stringify(response)
      });
    });
  };

  /**
   * 人脸对比
   */
  const faceCompare = () => {
    console.log('人脸对比');
    targetFileInput.current?.click();
  };

  /**
   * 选择文件
   * @param event
   */
  const onChangeFile: React.ChangeEventHandler<HTMLInputElement> = event => {
    const files = event.target.files || [];
    const file = files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(ev) {
        // base64码
        const imgFile = ev.target?.result; // 或 e.target 都是一样的
        const cameraTrack = localTracks.find(t => t.tag === 'camera');
        if (imgFile) {
          QNRTCAI.faceComparer(cameraTrack, imgFile + '').then(response => {
            Modal.info({
              title: '人脸对比信息',
              content: JSON.stringify(response)
            });
          }).catch(error => {
            Modal.info({
              title: '人脸对比失败',
              content: JSON.stringify(error)
            });
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * 切换前/后置摄像头
   */
  const toggleCamera = () => {
    setFacingMode(facingMode === 'environment' ? 'user' : 'environment');
    localTracks.forEach(track => track.release());
  };

  /**
   * 开始动作活体检测
   * @param actionType
   */
  const onFaceLiveAction = (actionType: string) => {
    try {
      const QNRTC = window.QNRTC.default;
      const cameraTrack = localTracks.find(track => track.tag === 'camera');
      const faceActionLiveDetector = QNRTCAI.FaceActionLiveDetector.start(QNRTC, cameraTrack, {
        action_types: [actionType]
      });
      setFaceActionLiveDetector(faceActionLiveDetector);
      setFaceActionLiveDetectorType(actionType);
    } catch (err) {
      Modal.error({
        title: 'onFaceLiveAction error',
        content: err.message
      });
    }
  };

  /**
   * 光线活体检测
   */
  const faceFlashLive = () => {
    setFaceFlashLiveStatus(FaceFlashLiveStatus.Pending);
    const cameraTrack = localTracks.find(track => track.tag === 'camera');
    const faceFlashLiveDetector = QNRTCAI.FaceFlashLiveDetector.start(cameraTrack);
    setTimeout(() => {
      setFaceFlashLiveStatus(FaceFlashLiveStatus.InProgress);
      faceFlashLiveDetector.commit().then(response => {
        Modal.info({
          title: '光线活体检测信息',
          content: JSON.stringify(response, null, 2)
        });
      }).catch(error => {
        Modal.error({
          title: '光线活体检测报错',
          content: `请求失败，http status: ${error.status}`
        });
      }).finally(() => {
        setFaceFlashLiveStatus(FaceFlashLiveStatus.Closed);
      });
    }, 3000);
  };

  /**
   * 开始/结束录制
   */
  const toggleRecord = () => {
    const nextValue = !isRecord;
    const QNRTC = window.QNRTC.default;
    const videoTrack = localTracks.find(track => track.tag === 'camera');
    const audioTrack = localTracks.find(track => track.tag === 'microphone');
    recorder.current = recorder.current || QNRTC.createMediaRecorder();
    // const setMimeTypeResult = recorder.current.setMimeType(recordMimeType);
    // if (!setMimeTypeResult) {
    //   Modal.error({
    //     title: `mimeType: ${recordMimeType} not supported`
    //   });
    //   return;
    // }
    if (nextValue) {
      recorder.current.start({
        videoTrack,
        audioTrack
      });
    } else {
      const recordBlob = recorder.current.stop();
      const blobURL = URL.createObjectURL(recordBlob);
      baseDownload(blobURL, 'test.webm');
    }
    setIsRecord(nextValue);
  };

  return <div className={css.room}>
    <div ref={cameraTrackElement} className={css.cameraTrack}></div>
    <div ref={remoteTrackElement} className={css.remoteTrack}></div>
    <div className={css.toolBox}>
      <Button className={css.toolBtn} size='small' type='primary' onClick={IDCard}>身份证识别</Button>
      <Popover
        trigger='click'
        content={
          <>
            <Button onClick={() => onFaceLiveAction('nod')} className={css.liveAction} size='small'
                    type='primary'>点点头</Button>
            <Button onClick={() => onFaceLiveAction('shake')} className={css.liveAction} size='small'
                    type='primary'>摇摇头</Button>
            <Button onClick={() => onFaceLiveAction('blink')} className={css.liveAction} size='small'
                    type='primary'>眨眨眼</Button>
            <Button onClick={() => onFaceLiveAction('mouth')} className={css.liveAction} size='small'
                    type='primary'>张张嘴</Button>
          </>
        }
      >
        <Button className={css.toolBtn} size='small' type='primary'>动作活体</Button>
      </Popover>
      <Button className={css.toolBtn} size='small' type='primary' onClick={faceFlashLive}>光线活体</Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={faceDetector}>人脸检测</Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={faceCompare}>人脸对比</Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={textToSpeak}>文转音</Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={toggleCamera}>切换摄像头</Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={speakToText}>
        {saying ? '关闭' : '开启'}语音转文字
      </Button>
      <Button className={css.toolBtn} size='small' type='primary' onClick={toggleRecord}>
        {isRecord ? '结束' : '开始'}录制
      </Button>
      <div className={css.toolBtn}>
        <Select placeholder='请选择录制的格式' onChange={value => setRecordMimeType(value)} size='small'
                style={{ width: '80%' }} value={recordMimeType}>
          {
            recordMimeTypes.map(mimeType => <Select.Option key={mimeType} value={mimeType}>{mimeType}</Select.Option>)
          }
        </Select>
      </div>
    </div>

    <Input
      placeholder='请输入文字转语音的内容'
      value={text}
      onChange={event => setText(event.target.value)}
    />
    {
      saying && <div className={css.caption}>
        识别结果：{captionText}
      </div>
    }

    <input
      className={css.targetFileInput}
      ref={targetFileInput}
      type='file'
      onChange={onChangeFile}
      accept='image/*'
    />

    {
      faceActionLiveDetectorText &&
      <div className={css.faceActionLiveDetectorToast}>{faceActionLiveDetectorText}：{countdown}</div>
    }

    {
      faceFlashLiveStatus !== FaceFlashLiveStatus.Closed &&
      <div className={css.faceActionLiveDetectorToast}>
        {
          faceFlashLiveStatus === FaceFlashLiveStatus.Pending ? '光线活体检测中...' : '光线活体数据请求中...'
        }
      </div>
    }
  </div>;
};

export default Room;