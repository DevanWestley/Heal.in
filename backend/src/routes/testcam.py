from pykinect2 import PyKinectRuntime, PyKinectV2
import numpy as np
import cv2

# 1. Inisialisasi Kinect untuk mode Infrared
kinect = PyKinectRuntime.PyKinectRuntime(PyKinectV2.FrameSourceTypes_Infrared)

while True:
    # 2. Cek apakah ada frame IR baru
    if kinect.has_new_infrared_frame():
        frame = kinect.get_last_infrared_frame()
        
        # 3. Reshape data (Kinect v2 IR resolution: 512 x 424)
        ir_image = frame.reshape((424, 512))
        
        # 4. Normalisasi data IR (16-bit) ke 8-bit agar bisa diproses OpenCV
        # Data IR Kinect seringkali sangat gelap, jadi perlu dikalibrasi
        ir_image_8bit = np.uint8(ir_image / 256)
        
        # 5. Tampilkan dengan OpenCV
        cv2.imshow('Kinect Windows IR', ir_image_8bit)
        
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

kinect.close()
cv2.destroyAllWindows()