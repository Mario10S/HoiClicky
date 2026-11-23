namespace HoiClicky;
// Push-to-talk keys: one key, or two keys held together. Key 2 = None (0) means a single key.
internal static class TalkKeys {
 public const int None=0;
 public static readonly int[] Supported=[162,163,164,165,160,161,20,32,118,119,120,121];
 public static void Validate(int key1,int key2){
  if(!Supported.Contains(key1))throw new Exception("Choose a supported talk key.");
  if(key2==None){if(key1==32)throw new Exception("Space cannot be the only talk key because it is used while typing. Pick another key or add a second key.");return;}
  if(!Supported.Contains(key2)||key1==key2)throw new Exception("Choose two different supported keys, or set Key 2 to None.");
 }
 public static bool Held(int key1,int key2,Func<int,bool> isDown)=>isDown(key1)&&(key2==None||isDown(key2));
}
