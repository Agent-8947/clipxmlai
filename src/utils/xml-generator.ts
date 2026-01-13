import { TimelineClip } from './auto-editor';
import { AudioTrack } from '@/store/useStore';

// Escape XML special characters
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateXML(timeline: TimelineClip[], audio: AudioTrack, _titleText: string): string {
    const fps = 30;
    const totalFrames = Math.ceil(audio.duration * fps);

    // Build media clips XML (Video & Images)
    const videoClipsXml = timeline.map((clip, index) => {
        const start = Math.round(clip.timelineStart * fps);
        const end = Math.round(clip.timelineEnd * fps);
        // For images, sourceStart/End are handled, usually 0 to duration
        const inFrame = Math.round(clip.sourceStart * fps);
        const outFrame = Math.round(clip.sourceEnd * fps);
        const clipDuration = end - start;
        // Use generic file id
        const fileId = `file-media-${index}`;
        const clipName = escapeXml(clip.videoName);
        // Note: clip.videoName comes from media.name

        // Determine correct path URL format - ensure localhost is prefixed if needed
        const fileUrl = `file://localhost/${encodeURIComponent(clip.videoName)}`;

        return `            <clipitem id="clipitem-${index}">
                <name>${clipName}</name>
                <duration>${clipDuration}</duration>
                <rate>
                    <timebase>${fps}</timebase>
                    <ntsc>FALSE</ntsc>
                </rate>
                <start>${start}</start>
                <end>${end}</end>
                <in>${inFrame}</in>
                <out>${outFrame}</out>
                <file id="${fileId}">
                    <name>${clipName}</name>
                    <pathurl>${fileUrl}</pathurl>
                    <rate>
                        <timebase>${fps}</timebase>
                        <ntsc>FALSE</ntsc>
                    </rate>
                    <duration>100000</duration>
                    <media>
                        <video>
                            <samplecharacteristics>
                                <width>1920</width>
                                <height>1080</height>
                            </samplecharacteristics>
                        </video>
                    </media>
                </file>
                <sourcetrack>
                    <mediatype>video</mediatype>
                    <trackindex>1</trackindex>
                </sourcetrack>
            </clipitem>`;
    }).join('\n');

    // Build audio clip XML
    const audioName = escapeXml(audio.name);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
    <sequence id="sequence-1">
        <name>MainSequence</name>
        <duration>${totalFrames}</duration>
        <rate>
            <timebase>${fps}</timebase>
            <ntsc>FALSE</ntsc>
        </rate>
        <timecode>
            <rate>
                <timebase>${fps}</timebase>
                <ntsc>FALSE</ntsc>
            </rate>
            <string>00:00:00:00</string>
            <frame>0</frame>
            <displayformat>NDF</displayformat>
        </timecode>
        <media>
            <video>
                <format>
                    <samplecharacteristics>
                        <rate>
                            <timebase>${fps}</timebase>
                            <ntsc>FALSE</ntsc>
                        </rate>
                        <width>1920</width>
                        <height>1080</height>
                        <pixelaspectratio>square</pixelaspectratio>
                        <fielddominance>none</fielddominance>
                    </samplecharacteristics>
                </format>
                <track>
${videoClipsXml}
                </track>
            </video>
            <audio>
                <format>
                    <samplecharacteristics>
                        <samplerate>48000</samplerate>
                        <depth>16</depth>
                    </samplecharacteristics>
                </format>
                <track>
                    <clipitem id="clipitem-audio-1">
                        <name>${audioName}</name>
                        <duration>${totalFrames}</duration>
                        <rate>
                            <timebase>${fps}</timebase>
                            <ntsc>FALSE</ntsc>
                        </rate>
                        <start>0</start>
                        <end>${totalFrames}</end>
                        <in>0</in>
                        <out>${totalFrames}</out>
                        <file id="file-audio-1">
                            <name>${audioName}</name>
                            <pathurl>file://localhost/${encodeURIComponent(audio.name)}</pathurl>
                            <rate>
                                <timebase>${fps}</timebase>
                                <ntsc>FALSE</ntsc>
                            </rate>
                            <duration>${totalFrames}</duration>
                            <media>
                                <audio>
                                    <samplecharacteristics>
                                        <samplerate>48000</samplerate>
                                        <depth>16</depth>
                                    </samplecharacteristics>
                                </audio>
                            </media>
                        </file>
                        <sourcetrack>
                            <mediatype>audio</mediatype>
                            <trackindex>1</trackindex>
                        </sourcetrack>
                    </clipitem>
                </track>
            </audio>
        </media>
    </sequence>
</xmeml>`;

    return xml;
}

