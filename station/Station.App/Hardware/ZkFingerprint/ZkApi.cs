using System.Runtime.InteropServices;

namespace Apex.Station.Hardware.ZkFingerprint;

internal static class ZkApi
{
    public const int ZKFP_ERR_OK          =  0;
    public const int ZKFP_ERR_INITLIB     = -1;
    public const int ZKFP_ERR_NOTOPEN     = -3;
    public const int ZKFP_ERR_NOMEMORY    = -6;
    public const int ZKFP_ERR_BUSY        = -7;
    public const int ZKFP_ERR_CAPFAIL     = -8;
    public const int ZKFP_ERR_EXTRACTFAIL = -9;

    public const int TEMPLATE_SIZE = 2048;   // safe upper bound for ZK9500
    public const int IMAGE_SIZE    = 153600; // 320×480 for ZK9500

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_Init();

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_Terminate();

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_GetDeviceCount();

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern IntPtr ZKFP_OpenDevice(int index);

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_CloseDevice(IntPtr hDevice);

    // fpLen: in = buffer capacity, out = actual template length written
    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_AcquireFingerprint(
        IntPtr hDevice,
        [Out] byte[]  fpTemplate, ref int fpLen,
        [Out] byte[]? fpImage,   ref int imgLen,
        ref int quality);

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern IntPtr ZKFP_DBInit(int capacity);

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBFree(IntPtr hDBCache);

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBClear(IntPtr hDBCache);

    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBAdd(
        IntPtr hDBCache,
        int fpId,
        [In] byte[] fpTemplate, int fpLen);

    // 1:N identification — sets fpId and score on ZKFP_ERR_OK
    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBIdentify(
        IntPtr hDBCache,
        [In] byte[] fpTemplate, int fpLen,
        ref int fpId, ref int score);

    // 1:1 verification — score 0–100
    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBMatch(
        IntPtr hDBCache,
        [In] byte[] fpTemplate1, int fpLen1,
        [In] byte[] fpTemplate2, int fpLen2,
        ref int score);

    // Merges 3 enrolment captures into one final template
    [DllImport("libzkfp.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int ZKFP_DBMerge(
        IntPtr hDBCache,
        [In] byte[] fpTemplate1,
        [In] byte[] fpTemplate2,
        [In] byte[] fpTemplate3,
        [Out] byte[] fpMerged,
        ref int mergedLen);
}
