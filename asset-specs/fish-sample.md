# Spec: fish-sample (bộ cá mẫu cho game Bể Cá Hạnh Phúc)

Bộ mẫu để duyệt art direction trước khi làm đủ 11 loài: **1 loài free (cá vàng tròn)** và **1 loài huyền thoại (cá rồng ánh kim)** ở các hình tiến hóa, cộng trứng và cá bột dùng chung. Xem `docs/plan-be-ca-hanh-phuc.md` mục 4.

Kế thừa `style-guide.md` (chất liệu, góc nhìn ngang, nền trắng, một vật thể giữa khung, không chữ, 1024×1024, quy tắc vật thể trong mờ và glow).

## Quy tắc riêng cho cá (bắt buộc)
- **Đầu cá quay sang PHẢI**, đuôi bên trái. Thân nằm **thẳng ngang**, không uốn cong, không quẫy. Vây đuôi duỗi thẳng ra sau theo trục thân, không gập về phía trước. (Code sẽ tự uốn thân và vẫy đuôi; ảnh phải thẳng để biến dạng đẹp.)
- Cá chiếm khoảng **80% chiều ngang** khung, căn giữa theo chiều dọc; vây và râu không chạm mép, không bị cắt.
- **Chibi dễ thương:** đầu tròn to, mắt to tròn long lanh có 1–2 điểm sáng trắng, má hồng nhẹ, miệng nhỏ cười. Mắt ở cùng vị trí tương đối (khoảng 1/4 thân tính từ mũi) ở mọi hình của cùng một loài.
- Chất liệu vinyl/đất sét mịn, bóng nhẹ, ánh sáng dịu từ trên-trái; **không** bóng đổ xuống nền, không bọt nước, không rong, không nước xung quanh.
- Cùng một loài: giữ đúng bảng màu, hình dáng đầu, mắt, hoa văn xuyên suốt các hình để nhận ra là cùng một con đang lớn.

## Định hướng hai bậc
- **Cá vàng tròn (free):** đơn giản, dễ thương, gọn. Màu cam ấm `#FF8A3D` pha kem `#FFF4E0` ở bụng. Không ánh kim, không hạt sáng, không hoa văn cầu kỳ. Lớn lên chỉ to tròn hơn, vây đầy hơn.
- **Cá rồng ánh kim (huyền thoại):** dáng thon dài như cá rồng, có hai râu mềm ở cằm, vảy lớn xếp lớp như vảy rồng. Vàng kim `#F6C445` bóng kim loại, viền vảy đỏ son `#E8503A`, vây chuyển từ vàng sang cam đỏ như lụa/lửa. Mỗi cấp **đổi hình dạng rõ rệt**, không chỉ to lên.

Output `assets/raw/fish/<assetId>.png`:
| assetId | Mô tả |
|---|---|
| fish-egg-common | Một quả trứng cá tròn dạng gel mờ màu cam nhạt pha kem, bóng nhẹ, bên trong thấy lờ mờ một mầm cá nhỏ cuộn tròn với chấm mắt đen; đơn giản, không trang trí |
| fish-egg-legendary | Một quả trứng cá tròn dạng gel mờ màu vàng kim óng ánh, bề mặt có vân vảy rồng mờ và vài đốm sáng lấp lánh dính trên vỏ, bên trong thấy lờ mờ mầm cá cuộn tròn với chấm mắt; viền vàng sáng; trông quý giá như ngọc |
| fish-fry-base | Cá bột mới nở nhìn ngang đầu quay phải: thân nhỏ dạng gel mờ màu ngà trắng xám trung tính, đầu rất to so với thân, mắt đen to tròn long lanh, bụng có túi noãn hoàng tròn màu vàng nhạt, vây đuôi chỉ là một dải màng mỏng mờ, chưa có vây lưng rõ; dễ thương như em bé |
| goldfish-juvenile | Cá vàng tròn giai đoạn cá con nhìn ngang đầu quay phải: thân tròn nhỏ màu cam nhạt, bụng kem, vây ngắn tròn, đuôi đơn nhỏ, mắt to long lanh, má hồng; đơn giản, mộc mạc |
| goldfish-teen | Cá vàng tròn giai đoạn thiếu niên nhìn ngang đầu quay phải: thân tròn hơn, màu cam đậm hơn, bụng kem, đuôi bắt đầu tách thành hai thùy ngắn, vây lưng nhỏ dựng lên, mắt to, cười nhẹ |
| goldfish-adult | Cá vàng tròn trưởng thành nhìn ngang đầu quay phải: thân tròn mũm mĩm màu cam ấm, bụng kem, đuôi đôi xòe mềm dài vừa phải duỗi thẳng ra sau, vây lưng và vây bụng đầy đặn, mắt to long lanh, má hồng; dễ thương, không ánh kim, không hoa văn |
| dragonfish-juvenile | Cá rồng ánh kim giai đoạn cá con nhìn ngang đầu quay phải: thân thon dài nhỏ màu vàng nhạt bóng, hai râu ngắn ở cằm, vảy mờ chưa rõ, vây ngắn ánh cam, mắt to long lanh; đã có nét quý phái nhưng còn non |
| dragonfish-teen | Cá rồng ánh kim giai đoạn thiếu niên nhìn ngang đầu quay phải: thân thon dài hơn, vảy vàng kim lớn xếp lớp đã rõ với viền đỏ son mảnh, hai râu dài mềm, vây lưng dài chạy dọc thân, vây đuôi bắt đầu xòe như lụa vàng chuyển cam, bóng kim loại nhẹ |
| dragonfish-adult | Cá rồng ánh kim trưởng thành nhìn ngang đầu quay phải: thân dài mạnh mẽ phủ vảy vàng kim bóng loáng như kim loại, viền vảy đỏ son rõ, hai râu dài uốn nhẹ, vây lưng và vây bụng dài như dải lụa chuyển vàng sang đỏ cam, đuôi lớn xòe rộng duỗi thẳng ra sau, vài đốm sáng lấp lánh dính trên vảy, mắt to sáng đầy khí chất |
| dragonfish-king | Cá rồng ánh kim cấp cá chúa nhìn ngang đầu quay phải: như bản trưởng thành nhưng lộng lẫy hơn hẳn — vây đuôi và vây lưng cực dài dạng lụa lửa vàng cam đỏ có đầu vây phát sáng, vảy vàng kim có viền đỏ son và ánh cầu vồng nhẹ, trên trán có gờ vảy nhô lên như sừng nhỏ, râu dài thướt tha, nhiều đốm sáng lấp lánh bám trên vảy và vây (không tỏa ra nền), dáng uy nghi nhưng vẫn mắt to dễ thương |

## Tiêu chí duyệt bộ mẫu
1. Đặt `goldfish-adult` cạnh `dragonfish-adult` ở cỡ 110px: nhìn lướt phải biết ngay con nào là cá quà.
2. Đặt 4 hình cá rồng theo thứ tự: thấy rõ đây là **một con đang lớn**, mỗi bước có thay đổi hình dạng.
3. Thu nhỏ `fish-fry-base` còn 36px: vẫn nhận ra mắt và hình cá.
4. Mọi ảnh cá: đầu quay phải, thân thẳng ngang, nền trắng sạch, tách nền không bị lủng ở phần gel mờ.
