import { create } from 'xmlbuilder2';
import { TimelineClip } from './auto-editor';
import { AudioTrack } from '@/store/useStore';

export function generateXML(timeline: TimelineClip[], audio: AudioTrack, titleText: string): string {
    const fps = 30;

    const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('xmeml', { version: '4' })
        .ele('project')
        .ele('name').txt('AutoMusicVideo').up()
        .ele('children')
        .ele('sequence', { id: 'sequence-1' })
        .ele('name').txt('MainSequence').up()
        .ele('duration').txt(String(Math.ceil(audio.duration * fps))).up()
        .ele('rate')
        .ele('timebase').txt(String(fps)).up()
        .ele('ntsc').txt('FALSE').up()
        .up()
        .ele('media')
        .ele('video')
        .ele('format')
        .ele('samplecharacteristics')
        .ele('rate')
        .ele('timebase').txt(String(fps)).up()
        .up()
        .ele('width').txt('1920').up()
        .ele('height').txt('1080').up()
        .ele('pixelaspectratio').txt('square').up()
        .up()
        .up()

        // Track 1: Video Clips
        .ele('track')
        .ele('enabled').txt('TRUE').up()
        .ele('locked').txt('FALSE').up();

    // Add Video Clips
    timeline.forEach((clip, index) => {
        const startFrame = Math.round(clip.timelineStart * fps);
        const endFrame = Math.round(clip.timelineEnd * fps);
        const inFrame = Math.round(clip.sourceStart * fps);
        const outFrame = Math.round(clip.sourceEnd * fps);

        const fileId = `file-${index}`;

        const clipNode = root.last().ele('clipitem', { id: `clipitem-video-${index}` });

        clipNode.ele('name').txt(clip.videoName).up()
            .ele('rate')
            .ele('timebase').txt(String(fps)).up()
            .ele('ntsc').txt('FALSE').up()
            .up()
            .ele('start').txt(String(startFrame)).up()
            .ele('end').txt(String(endFrame)).up()
            .ele('in').txt(String(inFrame)).up()
            .ele('out').txt(String(outFrame)).up()
            .ele('file', { id: fileId })
            .ele('name').txt(clip.videoName).up()
            .ele('pathurl').txt(`file://localhost/${clip.videoName}`).up() // Best guess
            .ele('rate')
            .ele('timebase').txt(String(fps)).up()
            .ele('ntsc').txt('FALSE').up()
            .up()
            .ele('media')
            .ele('video')
            .ele('duration').txt(String(100000)).up() // Dummy large duration
            .up()
            .up()
            .up();
    });

    // Track 2: Titles (if provided)
    if (titleText) {
        const track2 = root.ele('track')
            .ele('enabled').txt('TRUE').up()
            .ele('locked').txt('FALSE').up();

        track2.ele('clipitem', { id: 'title-clip' })
            .ele('name').txt('Title').up()
            .ele('rate')
            .ele('timebase').txt(String(fps)).up()
            .up()
            .ele('start').txt('0').up()
            .ele('end').txt(String(5 * fps)).up() // 5 seconds
            .ele('generatoritem', { id: 'text-generator' })
            .ele('name').txt('Text').up()
            .ele('effect')
            .ele('name').txt('Text').up()
            .ele('effectid').txt('Text').up()
            .ele('parameter')
            .ele('name').txt('Content').up()
            .ele('value').txt(titleText).up()
            .up()
            .up()
            .up()
            .up();

        track2.up(); // Close track
    }

    // Audio Track
    root.up() // Close first track or media? No, media/video
        .up() // Close media/video
        .ele('audio')
        .ele('track')
        .ele('enabled').txt('TRUE').up()
        .ele('locked').txt('FALSE').up()
        .ele('clipitem', { id: 'clipitem-audio-1' })
        .ele('name').txt(audio.name).up()
        .ele('rate')
        .ele('timebase').txt(String(fps)).up()
        .up()
        .ele('start').txt('0').up()
        .ele('end').txt(String(Math.ceil(audio.duration * fps))).up()
        .ele('in').txt('0').up()
        .ele('out').txt(String(Math.ceil(audio.duration * fps))).up()
        .ele('file', { id: 'file-audio-1' })
        .ele('name').txt(audio.name).up()
        .ele('pathurl').txt(`file://localhost/${audio.name}`).up()
        .ele('media')
        .ele('audio').up()
        .up()
        .up()
        .up()
        .up()
        .up(); // Close audio

    return root.end({ prettyPrint: true });
}
